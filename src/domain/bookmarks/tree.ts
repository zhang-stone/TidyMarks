import type { ScanFolder, ScanResult, ScannedBookmark } from '../../shared/schemas';
import type { BookmarkNode } from './types';
import { isFolder, isUnmodifiable } from './types';

/**
 * 识别 Chrome 系统根目录（书签栏 / 其他书签 / 移动设备书签等）。
 * 不硬编码根目录 ID：getTree() 顶层节点的直接子节点即为系统根目录（带 folderType），
 * 若顶层本身已是多个节点则取所有无 parentId 的节点。
 */
export function identifyRoots(tree: BookmarkNode[]): BookmarkNode[] {
  if (tree.length === 1 && tree[0]?.children?.length) {
    const top = tree[0];
    const children = top.children;
    // 触不可修改的虚拟根（id 通常为 "0"），其子节点为系统根目录。
    if (!top.parentId && children && children.every((c) => isFolder(c))) {
      return children;
    }
  }
  return tree.filter((n) => !n.parentId && isFolder(n));
}

interface WalkContext {
  rootId: string;
  /** 当前目录相对根目录的目录名路径（不含根目录自身）。 */
  path: string[];
  depth: number;
}

/**
 * 将书签树扁平化为一次一致的扫描结果。
 * - 以节点 ID 为内部主键，不以标题或 URL 作身份标识；
 * - 跳过不可修改节点及其整个子树（架构方案第 7 节）。
 */
export function buildScanResult(
  tree: BookmarkNode[],
  scanId: string,
  scannedAt = Date.now(),
): ScanResult {
  const roots = identifyRoots(tree).map((r) => ({ id: r.id, title: r.title }));
  const rootIds = new Set(roots.map((r) => r.id));
  const folders: ScanFolder[] = [];
  const bookmarks: ScannedBookmark[] = [];

  const walk = (node: BookmarkNode, ctx: WalkContext): void => {
    for (const child of node.children ?? []) {
      if (isUnmodifiable(child)) {
        continue;
      }
      if (isFolder(child)) {
        const folderPath = [...ctx.path, child.title];
        folders.push({
          id: child.id,
          parentId: node.id,
          rootId: ctx.rootId,
          title: child.title,
          path: folderPath,
          depth: ctx.depth + 1,
        });
        walk(child, { rootId: ctx.rootId, path: folderPath, depth: ctx.depth + 1 });
      } else {
        bookmarks.push({
          id: child.id,
          title: child.title,
          url: child.url ?? '',
          parentId: node.id,
          rootId: ctx.rootId,
          path: ctx.path,
        });
      }
    }
  };

  for (const root of identifyRoots(tree)) {
    if (!rootIds.has(root.id)) continue;
    walk(root, { rootId: root.id, path: [], depth: 0 });
  }

  return { scanId, scannedAt, roots, folders, bookmarks };
}
