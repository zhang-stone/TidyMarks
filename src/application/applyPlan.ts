import type { BookmarksPort, EventsPort, StoragePort } from './ports';
import { assertTransition, isWriteLocked } from '../domain/organize/stateMachine';
import type { BookmarkNode } from '../domain/bookmarks/types';
import { classifyError } from '../shared/errors';
import type {
  Assignment,
  FailureItem,
  JobState,
  ScannedBookmark,
  UndoMove,
  UndoSnapshot,
} from '../shared/schemas';

export interface ApplyDeps {
  bookmarks: BookmarksPort;
  storage: StoragePort;
  events?: EventsPort;
  now?: () => number;
}

export interface ApplyResult {
  job: JobState;
  appliedIds: string[];
  failures: FailureItem[];
}

export interface ApplyPlanOptions {
  /** 保守模式关闭目录创建；目标目录已不存在时只跳过对应书签。 */
  createMissingFolders?: boolean;
}

interface ResolvedTarget {
  rootId: string;
  /** 目标叶子目录 ID。 */
  folderId: string;
}

/**
 * 一键应用（架构方案第 8 节）。Service Worker 是唯一调用入口。
 *
 * 顺序：
 * 1. 建立任务锁（applying）；
 * 2. 基于最新书签状态构建撤销快照（每条待移动书签的 id / parentId / index）；
 * 3. 按路径逐级解析或创建目录（按 parentId + title 查找保证幂等）；
 * 4. 顺序 move，每条成功即更新游标与 appliedIds；单条失败入列继续；
 * 5. 完成置 completed 并展示失败与重试入口。
 *
 * 中断恢复：同一 jobId 重复进入时跳过已 applied 的书签，从持久化游标继续。
 */
export async function applyPlan(
  deps: ApplyDeps,
  job: JobState,
  bookmarks: ScannedBookmark[],
  assignments: Assignment[],
  options: ApplyPlanOptions = {},
): Promise<ApplyResult> {
  const { storage, events } = deps;
  const now = deps.now ?? (() => Date.now());
  const createMissingFolders = options.createMissingFolders ?? true;

  if (isWriteLocked(job.status) && job.status !== 'applying') {
    // undoing 期间拒绝新的应用请求。
    throw new Error(`当前任务状态为 ${job.status}，无法开始应用`);
  }
  if (job.status !== 'applying') {
    assertTransition(job.status, 'applying');
  }

  const byId = new Map(bookmarks.map((b) => [b.id, b] as const));
  const ordered: Array<{ bookmark: ScannedBookmark; assignment: Assignment }> = [];
  for (const assignment of assignments) {
    const bookmark = byId.get(assignment.bookmarkId);
    if (bookmark) ordered.push({ bookmark, assignment });
  }

  let working: JobState = {
    ...job,
    status: 'applying',
    updatedAt: now(),
    failures: job.status === 'applying' ? job.failures : [],
  };
  await storage.saveJob(working);

  // ---- 1. 应用前重新读取相关书签，不能信任扫描阶段的旧位置 ----
  const fresh = new Map<string, { parentId: string; index: number }>();
  const missing = new Set<string>();
  for (const { bookmark } of ordered) {
    if (working.appliedIds.includes(bookmark.id)) continue;
    const node = await deps.bookmarks.get(bookmark.id);
    if (!node || node.url === undefined) {
      missing.add(bookmark.id);
      continue;
    }
    fresh.set(bookmark.id, { parentId: node.parentId ?? '', index: node.index ?? 0 });
  }

  const existingFailures: FailureItem[] = working.failures.filter((f) => f.bookmarkId === undefined);
  for (const id of missing) {
    existingFailures.push({ bookmarkId: id, kind: 'validation', message: '书签已不存在，跳过' });
  }
  working = { ...working, failures: existingFailures };

  // ---- 2. 建立撤销快照（仅包含尚未应用的移动；已应用部分保留在 undo:latest 中） ----
  const undoExisting = await storage.loadUndo();
  const moves: UndoMove[] =
    undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.moves] : [];
  const knownMoveIds = new Set(moves.map((m) => m.bookmarkId));
  for (const { bookmark } of ordered) {
    if (working.appliedIds.includes(bookmark.id)) continue;
    if (knownMoveIds.has(bookmark.id)) continue;
    const pos = fresh.get(bookmark.id);
    if (!pos) continue;
    moves.push({
      bookmarkId: bookmark.id,
      fromParentId: pos.parentId,
      fromIndex: pos.index,
      toFolderId: '', // 解析目标目录后回填
    });
  }

  // ---- 3. 解析或创建目标目录 ----
  // 惰性按需读取目录结构：getChildren(parentId) + 缓存，避免每次全树扫描。
  const childrenByParent = new Map<string, BookmarkNode[]>();

  const createdFolders =
    undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.createdFolders] : [];
  const createdIds = new Set(createdFolders.map((f) => f.id));
  const folderCache = new Map<string, string>(); // `${rootId}|${path.join('/')}` -> folderId

  const resolveFolder = async (rootId: string, path: string[]): Promise<ResolvedTarget | null> => {
    const key = `${rootId}|${path.map((s) => s.toLowerCase()).join(' ')}`;
    const cached = folderCache.get(key);
    if (cached) return { rootId, folderId: cached };

    let parentId = rootId;
    let depth = 0;
    for (const segment of path) {
      depth += 1;
      const children = childrenByParent.get(parentId) ?? (await deps.bookmarks.getChildren(parentId));
      childrenByParent.set(parentId, children);
      const hit = children.find(
        (c) => c.url === undefined && c.title.toLowerCase() === segment.toLowerCase(),
      );
      if (hit) {
        parentId = hit.id;
      } else {
        if (!createMissingFolders) return null;
        const created = await deps.bookmarks.createFolder(parentId, segment);
        const node: BookmarkNode = { id: created.id, parentId, title: segment };
        childrenByParent.set(created.id, []);
        const siblings = childrenByParent.get(parentId) ?? [];
        siblings.push(node);
        childrenByParent.set(parentId, siblings);
        if (!createdIds.has(created.id)) {
          createdIds.add(created.id);
          createdFolders.push({ id: created.id, depth });
        }
        parentId = created.id;
      }
    }
    folderCache.set(key, parentId);
    return { rootId, folderId: parentId };
  };

  const resolvedTargets = new Map<string, ResolvedTarget>();
  const resolutionFailures: FailureItem[] = [];
  for (const { bookmark, assignment } of ordered) {
    if (working.appliedIds.includes(bookmark.id) || missing.has(bookmark.id)) continue;
    const target = await resolveFolder(bookmark.rootId, assignment.targetPath);
    if (!target) {
      resolutionFailures.push({
        bookmarkId: bookmark.id,
        kind: 'validation',
        message: '保守模式的目标文件夹已不存在，已跳过',
      });
      continue;
    }
    resolvedTargets.set(bookmark.id, target);
    const move = moves.find((m) => m.bookmarkId === bookmark.id);
    if (move) move.toFolderId = target.folderId;
    // 新建目录即时持久化，保证中断后目录不丢。
    working = { ...working, createdFolderIds: createdFolders.map((f) => f.id), updatedAt: now() };
    await storage.saveJob(working);
  }
  if (resolutionFailures.length > 0) {
    working = {
      ...working,
      failures: [...working.failures, ...resolutionFailures],
      updatedAt: now(),
    };
    await storage.saveJob(working);
  }

  // ---- 快照保存成功后才覆盖上一份撤销快照（架构方案第 9 节） ----
  const snapshot: UndoSnapshot = {
    jobId: job.jobId,
    createdAt: now(),
    moves: moves.filter((m) => m.toFolderId.length > 0),
    createdFolders,
  };
  await storage.saveUndo(snapshot);

  // ---- 4. 顺序移动 ----
  const failures: FailureItem[] = [...working.failures];
  const total = ordered.length;
  let processed = 0;

  for (const { bookmark } of ordered) {
    processed += 1;
    // 取消检查：重读持久化标志，CANCEL_JOB 更新存储后立即生效。
    const persisted = await storage.loadJob();
    if (persisted?.cancelRequested) {
      const interrupted: JobState = {
        ...working,
        status: 'interrupted',
        cancelRequested: true,
        updatedAt: now(),
      };
      await storage.saveJob(interrupted);
      events?.interrupted(interrupted);
      return { job: interrupted, appliedIds: interrupted.appliedIds, failures: interrupted.failures };
    }
    if (working.appliedIds.includes(bookmark.id)) {
      events?.progress(job.jobId, 'applying', processed, total);
      continue;
    }
    if (missing.has(bookmark.id)) continue;

    const target = resolvedTargets.get(bookmark.id);
    if (!target) continue;

    // 幂等：移动前检查当前位置，已在目标目录时直接标记完成。
    const current = await deps.bookmarks.get(bookmark.id);
    if (!current) {
      failures.push({ bookmarkId: bookmark.id, kind: 'validation', message: '书签在应用过程中被删除' });
      continue;
    }
    if (current.parentId === target.folderId) {
      working = {
        ...working,
        appliedIds: [...working.appliedIds, bookmark.id],
        applyCursor: processed,
        updatedAt: now(),
      };
      await storage.saveJob(working);
      events?.progress(job.jobId, 'applying', processed, total);
      continue;
    }

    try {
      await deps.bookmarks.move(bookmark.id, { parentId: target.folderId });
      working = {
        ...working,
        appliedIds: [...working.appliedIds, bookmark.id],
        applyCursor: processed,
        updatedAt: now(),
      };
      await storage.saveJob(working);
    } catch (error) {
      const classified = classifyError(error);
      failures.push({ bookmarkId: bookmark.id, kind: classified.kind, message: classified.message });
      working = { ...working, failures, applyCursor: processed, updatedAt: now() };
      await storage.saveJob(working);
    }
    events?.progress(job.jobId, 'applying', processed, total);
  }

  const completed: JobState = { ...working, failures, status: 'completed', updatedAt: now() };
  await storage.saveJob(completed);
  events?.completed(completed);
  return { job: completed, appliedIds: completed.appliedIds, failures };
}
