import type { UndoMove, UndoSnapshot } from '../../shared/schemas';

/** 撤销时单条移动的可执行性判定。 */
export type RestoreDecision =
  | { action: 'restore'; move: UndoMove }
  | { action: 'skip'; move: UndoMove; reason: 'moved_by_user' | 'bookmark_missing' | 'parent_missing' };

/**
 * 判定一条快照记录是否应恢复（架构方案第 9 节）：
 * 书签当前仍在本次应用的目标目录时才恢复；
 * 已被用户再次移动或已删除则跳过并报冲突，不覆盖用户的新操作。
 */
export function decideRestore(
  move: UndoMove,
  currentBookmark: { parentId?: string } | undefined,
  parentExists: boolean,
): RestoreDecision {
  if (!currentBookmark) {
    return { action: 'skip', move, reason: 'bookmark_missing' };
  }
  if (!parentExists) {
    return { action: 'skip', move, reason: 'parent_missing' };
  }
  if (currentBookmark.parentId !== move.toFolderId) {
    return { action: 'skip', move, reason: 'moved_by_user' };
  }
  return { action: 'restore', move };
}

/**
 * 恢复顺序：按原 parentId 分组，组内按原 index 升序移回，
 * 使目录内的相对顺序尽量恢复到应用前状态。
 */
export function orderRestores(moves: UndoMove[]): UndoMove[] {
  const groups = new Map<string, UndoMove[]>();
  for (const move of moves) {
    const group = groups.get(move.fromParentId);
    if (group) {
      group.push(move);
    } else {
      groups.set(move.fromParentId, [move]);
    }
  }
  const ordered: UndoMove[] = [];
  for (const group of groups.values()) {
    ordered.push(...[...group].sort((a, b) => a.fromIndex - b.fromIndex));
  }
  return ordered;
}

/**
 * 新建目录的删除顺序：按深度从深到浅。
 * 只删除空目录由调用方逐条确认；排序保证子目录先于父目录被检查。
 */
export function orderFoldersForDeletion(
  createdFolders: UndoSnapshot['createdFolders'],
): string[] {
  return [...createdFolders].sort((a, b) => b.depth - a.depth).map((f) => f.id);
}
