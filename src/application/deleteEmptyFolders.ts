import { findEmptyFolders } from '../domain/bookmarks/emptyFolders';
import { buildScanResult } from '../domain/bookmarks/tree';
import type { BookmarkNode } from '../domain/bookmarks/types';
import type { ScanResult } from '../shared/schemas';
import type { BookmarksPort, StoragePort } from './ports';

export interface DeleteEmptyFoldersResult {
  scan: ScanResult;
  deletedIds: string[];
  failures: Array<{ folderId: string; message: string }>;
}

/** 实时检查目录子树内是否仍有书签，防止扫描结果被用户手动改动后误删书签。 */
async function subtreeHasBookmarks(bookmarks: BookmarksPort, folderId: string): Promise<boolean> {
  const queue: BookmarkNode[] = await bookmarks.getChildren(folderId);
  while (queue.length) {
    const node = queue.shift()!;
    if (node.url !== undefined) return true;
    if (node.children) queue.push(...node.children);
    else queue.push(...(await bookmarks.getChildren(node.id)));
  }
  return false;
}

/** 只允许删除最近一次扫描中识别出的空文件夹，删除后重新扫描以同步持久化状态。 */
export async function deleteEmptyFolders(
  deps: { bookmarks: BookmarksPort; storage: StoragePort; now?: () => number; newId?: () => string },
  folderIds: string[],
): Promise<DeleteEmptyFoldersResult> {
  const previous = await deps.storage.loadScan();
  if (!previous) throw new Error('没有可用的扫描结果，请先扫描');

  const ids = [...new Set(folderIds)];
  const emptyFolderIds = new Set(findEmptyFolders(previous).map((folder) => folder.id));
  if (ids.some((id) => !emptyFolderIds.has(id))) {
    throw new Error('待删除项不是当前扫描识别出的空文件夹，请重新检查');
  }

  const depthById = new Map(previous.folders.map((folder) => [folder.id, folder.depth]));
  // 先删深层：父目录删除后，其中的空子目录节点已不存在，后续迭代自动跳过
  const ordered = [...ids].sort((a, b) => (depthById.get(b) ?? 0) - (depthById.get(a) ?? 0));

  const deletedIds: string[] = [];
  const failures: Array<{ folderId: string; message: string }> = [];
  for (const id of ordered) {
    try {
      const node = await deps.bookmarks.get(id);
      if (!node) {
        // 节点已随父目录一并删除
        deletedIds.push(id);
        continue;
      }
      if (await subtreeHasBookmarks(deps.bookmarks, id)) {
        failures.push({ folderId: id, message: '文件夹内已存在书签，已跳过' });
        continue;
      }
      await deps.bookmarks.removeTree(id);
      deletedIds.push(id);
    } catch (error) {
      failures.push({ folderId: id, message: error instanceof Error ? error.message : '删除失败' });
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
