import type { ScanFolder, ScanResult } from '../../shared/schemas';

/**
 * 找出所有空文件夹：自身及全部后代目录中都没有任何书签的目录。
 * 顶级根目录（书签栏/其他书签）不在 scan.folders 中，天然不会被清理。
 */
export function findEmptyFolders(scan: ScanResult): ScanFolder[] {
  const parentById = new Map(scan.folders.map((folder) => [folder.id, folder.parentId]));
  const nonEmptyIds = new Set<string>();
  for (const bookmark of scan.bookmarks) {
    let id: string | undefined = bookmark.parentId;
    while (id !== undefined && !nonEmptyIds.has(id)) {
      nonEmptyIds.add(id);
      id = parentById.get(id);
    }
  }
  return scan.folders
    .filter((folder) => !nonEmptyIds.has(folder.id))
    .sort((a, b) => b.depth - a.depth);
}
