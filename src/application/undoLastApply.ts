import type { BookmarksPort, EventsPort, StoragePort } from './ports';
import { assertTransition, isWriteLocked } from '../domain/organize/stateMachine';
import {
  decideRestore,
  orderFoldersForDeletion,
  orderFoldersForRecreation,
  orderRestores,
  type RestoreDecision,
} from '../domain/undo/snapshot';
import { AppError, classifyError } from '../shared/errors';
import { t, type MessageKey } from '../shared/i18n';
import type { FailureItem, JobState, UndoMove, UndoSnapshot } from '../shared/schemas';

export interface UndoDeps {
  bookmarks: BookmarksPort;
  storage: StoragePort;
  events?: EventsPort;
  now?: () => number;
}

export interface UndoResult {
  job: JobState;
  /** 冲突与失败详情；全部成功时为空。 */
  conflicts: FailureItem[];
}

const CONFLICT_REASON_KEYS = {
  moved_by_user: 'errors.undoMovedByUser',
  bookmark_missing: 'errors.undoBookmarkMissing',
  parent_missing: 'errors.undoParentMissing',
} satisfies Record<string, MessageKey>;

/**
 * 一键撤销最近一次整理（架构方案第 9 节）。Service Worker 是唯一调用入口。
 *
 * 1. 仅处理快照 moves 中成功移动过的书签；
 * 2. 每条先判定可恢复性（仍在本次应用的目标目录才恢复；用户二次移动、
 *    已删除或原父目录不存在则跳过并报冲突，不覆盖用户的新操作）；
 * 3. 恢复顺序：按原 parentId 分组、组内按原 index 升序移回；
 * 4. 恢复后将本次新建目录按深度从深到浅删除，但只删除空目录；
 * 5. 有冲突时状态为 partially_undone，保留快照供用户重试。
 */
export async function undoLastApply(deps: UndoDeps, job: JobState): Promise<UndoResult> {
  const { storage, events, bookmarks } = deps;
  const now = deps.now ?? (() => Date.now());

  if (isWriteLocked(job.status)) {
    throw new AppError('user_conflict', 'errors.cannotUndoInState', { status: job.status });
  }
  assertTransition(job.status, 'undoing');

  const snapshot: UndoSnapshot | null = await storage.loadUndo();
  if (!snapshot || snapshot.jobId !== job.jobId) {
    throw new AppError('validation', 'errors.noUndoSnapshot');
  }

  let working: JobState = { ...job, status: 'undoing', updatedAt: now(), cancelRequested: false };
  await storage.saveJob(working);

  const conflicts: FailureItem[] = [];
  let cancelled = false;

  // ---- 0. 重建应用时被搬空删除的原文件夹，并把 fromParentId 重映射到新 id ----
  // 父目录先于子目录重建；创建失败的目录，其书签会在下面报 parent_missing 冲突。
  const folderIdMap = new Map<string, string>();
  for (const folder of orderFoldersForRecreation(snapshot.deletedFolders)) {
    const parentId = folderIdMap.get(folder.parentId) ?? folder.parentId;
    try {
      const original = await bookmarks.get(folder.id);
      if (original && original.url === undefined) {
        folderIdMap.set(folder.id, original.id);
        continue;
      }
      const siblings = await bookmarks.getChildren(parentId);
      const existing = siblings.find(
        (node) => node.url === undefined && node.title === folder.title,
      );
      if (existing) {
        folderIdMap.set(folder.id, existing.id);
        continue;
      }
      const created = await bookmarks.createFolder(parentId, folder.title, folder.index);
      folderIdMap.set(folder.id, created.id);
    } catch {
      // 原父目录已不存在或创建失败：忽略，交由后续冲突判定处理。
    }
  }
  const moves: UndoMove[] = snapshot.moves.map((move) =>
    folderIdMap.has(move.fromParentId)
      ? { ...move, fromParentId: folderIdMap.get(move.fromParentId)! }
      : move,
  );

  // ---- 1. 逐条判定可恢复性 ----
  const decisions: RestoreDecision[] = [];
  for (const move of moves) {
    const current = await bookmarks.get(move.bookmarkId);
    // 原父目录存在性单独确认（书签当前不在目标目录时也检查，便于报告冲突原因）。
    const originalParent = await bookmarks.get(move.fromParentId);
    const parentExists = originalParent !== undefined && originalParent.url === undefined;
    decisions.push(decideRestore(move, current, parentExists));
  }

  // ---- 2. 按恢复顺序移回 ----
  for (const decision of orderRestores(
    decisions.filter((d): d is Extract<RestoreDecision, { action: 'restore' }> =>
      d.action === 'restore',
    ).map((d) => d.move),
  )) {
    // 取消检查：重读持久化标志，CANCEL_JOB 更新存储后立即生效。
    const persisted = await storage.loadJob();
    if (persisted?.cancelRequested) {
      cancelled = true;
      break;
    }
    try {
      await bookmarks.move(decision.bookmarkId, {
        parentId: decision.fromParentId,
        index: decision.fromIndex,
      });
    } catch (error) {
      const classified = classifyError(error);
      conflicts.push({
        bookmarkId: decision.bookmarkId,
        kind: classified.kind,
        message: t('errors.restoreFailed', { message: classified.message }),
      });
    }
  }

  // ---- 3. 冲突收集（跳过项） ----
  for (const decision of decisions) {
    if (decision.action !== 'skip') continue;
    conflicts.push({
      bookmarkId: decision.move.bookmarkId,
      kind: 'user_conflict',
      message: t(CONFLICT_REASON_KEYS[decision.reason]),
    });
  }

  // ---- 4. 删除本次新建的空目录（深到浅） ----
  for (const folderId of orderFoldersForDeletion(snapshot.createdFolders)) {
    if (cancelled) break;
    try {
      const children = await bookmarks.getChildren(folderId);
      if (children.length === 0) {
        await bookmarks.remove(folderId);
      }
    } catch {
      // 目录已被用户手动删除或移动：忽略，不影响撤销结果。
    }
  }

  // 用户取消时保留快照与报告，状态为 partially_undone 以便重试撤销。
  if (cancelled) {
    conflicts.push({ kind: 'user_conflict', message: t('errors.undoInterrupted') });
  }

  const final: JobState = {
    ...working,
    status: conflicts.length > 0 ? 'partially_undone' : 'undone',
    failures: conflicts,
    updatedAt: now(),
  };
  await storage.saveJob(final);
  if (conflicts.length > 0) {
    events?.failed(final);
  } else {
    events?.completed(final);
  }
  return { job: final, conflicts };
}
