import { describe, expect, it } from 'vitest';
import { findEmptyFolders } from '@/src/domain/bookmarks/emptyFolders';
import { buildScanResult } from '@/src/domain/bookmarks/tree';
import type { BookmarkNode } from '@/src/domain/bookmarks/types';
import { fixtureTree } from './tree.test';

/** fixtureTree 基础上追加空目录：12（含空子目录 120）与 13。 */
export function treeWithEmptyFolders(): BookmarkNode[] {
  const tree = fixtureTree();
  tree[0]!.children![0]!.children!.push(
    {
      id: '12',
      parentId: '1',
      title: '空目录',
      children: [{ id: '120', parentId: '12', title: '空子目录' }],
    },
    { id: '13', parentId: '1', title: '另一个空目录' },
  );
  return tree;
}

describe('findEmptyFolders', () => {
  it('识别自身及后代均无书签的目录，深层在前', () => {
    const scan = buildScanResult(treeWithEmptyFolders(), 'scan-1', 1);
    expect(findEmptyFolders(scan).map((folder) => folder.id)).toEqual(['120', '12', '13']);
  });

  it('不含任何空目录时返回空数组', () => {
    const scan = buildScanResult(fixtureTree(), 'scan-1', 1);
    expect(findEmptyFolders(scan)).toEqual([]);
  });

  it('只含书签的目录链不被误判为空', () => {
    const scan = buildScanResult(treeWithEmptyFolders(), 'scan-1', 1);
    expect(findEmptyFolders(scan).some((folder) => folder.id === '10')).toBe(false);
  });
});
