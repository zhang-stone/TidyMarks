import { describe, expect, it } from 'vitest';
import { deleteEmptyFolders } from '@/src/application/deleteEmptyFolders';
import { buildScanResult } from '@/src/domain/bookmarks/tree';
import { createMemoryBookmarks, createMemoryStorage } from '../helpers/memoryAdapters';
import { treeWithEmptyFolders } from '../domain/emptyFolders.test';

describe('deleteEmptyFolders', () => {
  it('删除空文件夹并保存重新扫描后的结果，父目录删除时子目录一并移除', async () => {
    const bookmarks = createMemoryBookmarks(treeWithEmptyFolders());
    const storage = createMemoryStorage({
      scan: buildScanResult(await bookmarks.getTree(), 'before', 1),
    });

    const result = await deleteEmptyFolders(
      { bookmarks, storage, newId: () => 'after', now: () => 2 },
      ['120', '12', '13'],
    );

    expect(result.deletedIds).toEqual(['120', '12', '13']);
    expect(result.failures).toEqual([]);
    expect(result.scan.scanId).toBe('after');
    expect(result.scan.folders.some((folder) => ['12', '120', '13'].includes(folder.id))).toBe(false);
    expect(result.scan.bookmarks.length).toBe(4);
    expect(storage.dump().scan).toEqual(result.scan);
  });

  it('拒绝删除未被识别为空文件夹的 ID', async () => {
    const bookmarks = createMemoryBookmarks(treeWithEmptyFolders());
    const storage = createMemoryStorage({
      scan: buildScanResult(await bookmarks.getTree(), 'before', 1),
    });

    await expect(deleteEmptyFolders({ bookmarks, storage }, ['10']))
      .rejects.toThrow('不是当前扫描识别出的空文件夹');
  });

  it('没有扫描结果时直接拒绝', async () => {
    const bookmarks = createMemoryBookmarks(treeWithEmptyFolders());
    const storage = createMemoryStorage();

    await expect(deleteEmptyFolders({ bookmarks, storage }, ['12']))
      .rejects.toThrow('请先扫描');
  });

  it('扫描后目录被放入书签时跳过并记录失败，不会误删书签', async () => {
    // 实时树中 13 已被用户手动放入一条书签，但持久化的扫描结果中 13 仍是空目录
    const liveTree = treeWithEmptyFolders();
    liveTree[0]!.children![0]!.children!
      .find((node) => node.id === '13')!
      .children = [{ id: '130', parentId: '13', title: '新书签', url: 'https://example.com' }];
    const staleScan = buildScanResult(treeWithEmptyFolders(), 'before', 1);

    const bookmarks = createMemoryBookmarks(liveTree);
    const storage = createMemoryStorage({ scan: staleScan });

    const result = await deleteEmptyFolders({ bookmarks, storage }, ['13']);

    expect(result.deletedIds).toEqual([]);
    expect(result.failures).toEqual([{ folderId: '13', message: '文件夹内已存在书签，已跳过' }]);
    expect(bookmarks.nodes().some((node) => node.id === '130')).toBe(true);
  });
});
