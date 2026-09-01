import type { BookmarksPort, EventsPort, StoragePort } from './ports';
import { assertTransition, isWriteLocked } from '../domain/organize/stateMachine';
import { isUnmodifiable, type BookmarkNode } from '../domain/bookmarks/types';
import { classifyError } from '../shared/errors';
import type {
  Assignment,
  DeletedFolder,
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
  /** 只有这些原文件夹允许在变空后被清理。 */
  cleanupFolderIds?: string[];
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
 * 5. 从深到浅清理用户选中范围内的空目录；
 * 6. 完成置 completed 并展示失败与重试入口。
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
  const cleanupFolderIds = new Set(options.cleanupFolderIds ?? []);

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
    deletedFolders:
      undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.deletedFolders] : [],
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

  // ---- 5. 仅清理用户选中范围与本轮新建的空文件夹 ----
  const cleanup = await cleanupSelectedEmptyFolders(
    deps.bookmarks,
    storage,
    snapshot,
    new Set([...cleanupFolderIds, ...createdIds]),
    createdIds,
  );
  failures.push(...cleanup.failures);
  working = { ...working, failures, updatedAt: now() };
  if (cleanup.cancelled) {
    const interrupted: JobState = {
      ...working,
      status: 'interrupted',
      cancelRequested: true,
      updatedAt: now(),
    };
    await storage.saveJob(interrupted);
    events?.interrupted(interrupted);
    return { job: interrupted, appliedIds: interrupted.appliedIds, failures };
  }

  const completed: JobState = { ...working, status: 'completed', updatedAt: now() };
  await storage.saveJob(completed);
  events?.completed(completed);
  return { job: completed, appliedIds: completed.appliedIds, failures };
}

/**
 * 按最新树深度从深到浅清理候选目录。
 * 候选集合由用户明确选中的原文件夹和本轮新建目录组成；未选目录即使为空也不触碰。
 * 使用 remove 而不是 removeTree，使并发新增内容时由 Chrome 安全拒绝删除。
 */
async function cleanupSelectedEmptyFolders(
  bookmarks: BookmarksPort,
  storage: StoragePort,
  snapshot: UndoSnapshot,
  candidateIds: Set<string>,
  createdIds: Set<string>,
): Promise<{ deletedFolders: DeletedFolder[]; failures: FailureItem[]; cancelled: boolean }> {
  const tree = await bookmarks.getTree();
  const candidates: Array<{ node: BookmarkNode; depth: number }> = [];
  const visit = (node: BookmarkNode, depth: number): void => {
    if (candidateIds.has(node.id) && node.url === undefined) {
      candidates.push({ node, depth });
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  for (const root of tree) visit(root, 0);
  candidates.sort((a, b) => b.depth - a.depth);

  const deletedFolders = [...snapshot.deletedFolders];
  const recordedIds = new Set(deletedFolders.map((folder) => folder.id));
  const failures: FailureItem[] = [];

  for (const candidate of candidates) {
    const persisted = await storage.loadJob();
    if (persisted?.cancelRequested) {
      return { deletedFolders, failures, cancelled: true };
    }

    const node = await bookmarks.get(candidate.node.id);
    if (!node || node.url !== undefined) continue;
    if (!node.parentId || node.parentId === '0' || isUnmodifiable(node)) continue;
    const children = await bookmarks.getChildren(node.id);
    if (children.length > 0) continue;

    // 先记录再删除：即使 Service Worker 在两个操作之间被回收，撤销也能识别仍存在的原目录。
    if (!createdIds.has(node.id) && !recordedIds.has(node.id)) {
      recordedIds.add(node.id);
      deletedFolders.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        index: node.index ?? 0,
      });
      await storage.saveUndo({ ...snapshot, deletedFolders: [...deletedFolders] });
    }

    try {
      await bookmarks.remove(node.id);
    } catch (error) {
      const classified = classifyError(error);
      failures.push({
        folderId: node.id,
        kind: classified.kind,
        message: `清理空文件夹“${node.title}”失败：${classified.message}`,
      });
    }
  }

  return { deletedFolders, failures, cancelled: false };
}
