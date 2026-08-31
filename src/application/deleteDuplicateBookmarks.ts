import { buildScanResult } from '../domain/bookmarks/tree';
import { findDuplicateGroups } from '../domain/bookmarks/duplicates';
import type { ScanResult } from '../shared/schemas';
import type { BookmarksPort, StoragePort } from './ports';

export interface DeleteDuplicateBookmarksResult {
  scan: ScanResult;
  deletedIds: string[];
  failures: Array<{ bookmarkId: string; message: string }>;
}

/** 只允许删除最近一次扫描中出现的书签 ID，并在删除后重新扫描以同步持久化状态。 */
export async function deleteDuplicateBookmarks(
  deps: { bookmarks: BookmarksPort; storage: StoragePort; now?: () => number; newId?: () => string },
  bookmarkIds: string[],
): Promise<DeleteDuplicateBookmarksResult> {
  const previous = await deps.storage.loadScan();
  if (!previous) throw new Error('没有可用的扫描结果，请先扫描');

  const ids = [...new Set(bookmarkIds)];
  const requested = new Set(ids);
  const groups = findDuplicateGroups(previous.bookmarks);
  const duplicateIds = new Set(groups.flatMap((group) => group.bookmarks.map((bookmark) => bookmark.id)));
  if (ids.some((id) => !duplicateIds.has(id))) {
    throw new Error('待删除项不是当前扫描识别出的重复书签，请重新检查');
  }
  if (groups.some((group) => group.bookmarks.every((bookmark) => requested.has(bookmark.id)))) {
    throw new Error('每组重复书签至少需要保留一项');
  }

  const deletedIds: string[] = [];
  const failures: Array<{ bookmarkId: string; message: string }> = [];
  for (const id of ids) {
    try {
      await deps.bookmarks.remove(id);
      deletedIds.push(id);
    } catch (error) {
      failures.push({ bookmarkId: id, message: error instanceof Error ? error.message : '删除失败' });
    }
  }

  const tree = await deps.bookmarks.getTree();
  const scan = buildScanResult(
    tree,
    (deps.newId ?? (() => crypto.randomUUID()))(),
    (deps.now ?? (() => Date.now()))(),
  );
  await deps.storage.saveScan(scan);
  return { scan, deletedIds, failures };
}
