/**
 * Chrome 书签树的纯数据表示，与 chrome.bookmarks.BookmarkTreeNode 结构兼容，
 * 但不反向依赖浏览器 API（架构方案第 4 节依赖方向约束）。
 */
export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  /** 存在 url 表示书签节点，否则是目录节点。 */
  url?: string;
  dateAdded?: number;
  unmodifiable?: boolean | string;
  folderType?: string;
  children?: BookmarkNode[];
}

export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

export function isUnmodifiable(node: BookmarkNode): boolean {
  return node.unmodifiable !== undefined && node.unmodifiable !== false;
}
