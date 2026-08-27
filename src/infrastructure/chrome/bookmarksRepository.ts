import type { BookmarksPort } from '../../application/ports';
import type { BookmarkNode } from '../../domain/bookmarks/types';

/** chrome.bookmarks 的适配实现。 */
export function createBookmarksRepository(): BookmarksPort {
  return {
    async getTree() {
      const tree = await chrome.bookmarks.getTree();
      return tree as unknown as BookmarkNode[];
    },

    async get(id) {
      try {
        const nodes = await chrome.bookmarks.get(id);
        return (nodes[0] as unknown as BookmarkNode) ?? undefined;
      } catch {
        return undefined;
      }
    },

    async getChildren(parentId) {
      try {
        const children = await chrome.bookmarks.getChildren(parentId);
        return children as unknown as BookmarkNode[];
      } catch {
        return [];
      }
    },

    async createFolder(parentId, title) {
      const node = await chrome.bookmarks.create({ parentId, title });
      return { id: node.id };
    },

    async move(id, destination) {
      await chrome.bookmarks.move(id, destination);
    },

    async removeTree(id) {
      await chrome.bookmarks.removeTree(id);
    },
  };
}
