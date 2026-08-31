import { describe, expect, it } from 'vitest';
import { deleteDuplicateBookmarks } from '@/src/application/deleteDuplicateBookmarks';
import { buildScanResult } from '@/src/domain/bookmarks/tree';
import { createMemoryBookmarks, createMemoryStorage } from '../helpers/memoryAdapters';
import { fixtureTree } from '../domain/tree.test';

describe('deleteDuplicateBookmarks', () => {
  const treeWithDuplicate = () => {
    const tree = fixtureTree();
    tree[0]!.children![0]!.children![0]!.children!.push({
      id: '103', parentId: '10', title: 'GitHub duplicate', url: 'https://github.com',
    });
    return tree;
  };

  it('删除已识别的重复书签并保存重新扫描后的结果', async () => {
    const bookmarks = createMemoryBookmarks(treeWithDuplicate());
    const initial = buildScanResult(await bookmarks.getTree(), 'before', 1);
    const storage = createMemoryStorage({ scan: initial });

    const result = await deleteDuplicateBookmarks(
      { bookmarks, storage, newId: () => 'after', now: () => 2 },
      ['100', '100'],
    );

    expect(result.deletedIds).toEqual(['100']);
    expect(result.failures).toEqual([]);
    expect(result.scan.scanId).toBe('after');
    expect(result.scan.bookmarks.some((item) => item.id === '100')).toBe(false);
    expect(storage.dump().scan).toEqual(result.scan);
  });

  it('拒绝删除未被识别为重复项的 ID', async () => {
    const bookmarks = createMemoryBookmarks(fixtureTree());
    const storage = createMemoryStorage({
      scan: buildScanResult(await bookmarks.getTree(), 'before', 1),
    });

    await expect(deleteDuplicateBookmarks({ bookmarks, storage }, ['unknown']))
      .rejects.toThrow('不是当前扫描识别出的重复书签');
  });

  it('拒绝删除一个重复组中的全部书签', async () => {
    const bookmarks = createMemoryBookmarks(treeWithDuplicate());
    const storage = createMemoryStorage({
      scan: buildScanResult(await bookmarks.getTree(), 'before', 1),
    });

    await expect(deleteDuplicateBookmarks({ bookmarks, storage }, ['100', '103']))
      .rejects.toThrow('至少需要保留一项');
  });
});
