import { describe, expect, it } from 'vitest';
import { buildScanResult, identifyRoots } from '@/src/domain/bookmarks/tree';
import type { BookmarkNode } from '@/src/domain/bookmarks/types';

/** 模拟 Chrome 书签树：虚拟根 → 书签栏/其他书签两个系统根。 */
export function fixtureTree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: '书签栏',
          children: [
            {
              id: '10',
              parentId: '1',
              title: '开发',
              children: [
                { id: '100', parentId: '10', title: 'GitHub', url: 'https://github.com' },
                { id: '101', parentId: '10', title: 'MDN', url: 'https://developer.mozilla.org' },
              ],
            },
            { id: '102', parentId: '1', title: '购物', url: 'https://example.com/shop' },
            {
              id: '11',
              parentId: '1',
              title: '系统目录',
              unmodifiable: 'managed',
              children: [
                { id: '110', parentId: '11', title: '不可动', url: 'https://example.com/locked' },
              ],
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          title: '其他书签',
          children: [{ id: '200', parentId: '2', title: '新闻', url: 'https://news.example.com' }],
        },
      ],
    },
  ];
}

describe('identifyRoots', () => {
  it('识别虚拟根下的系统根目录，不硬编码 ID', () => {
    const roots = identifyRoots(fixtureTree());
    expect(roots.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('顶层已是多个根节点时直接返回', () => {
    const roots = identifyRoots([
      { id: '1', title: '书签栏', children: [] },
      { id: '2', title: '其他书签', children: [] },
    ]);
    expect(roots.map((r) => r.id)).toEqual(['1', '2']);
  });
});

describe('buildScanResult', () => {
  const scan = buildScanResult(fixtureTree(), 'scan-1', 1000);

  it('扁平化书签并以节点 ID 为主键', () => {
    expect(scan.bookmarks.map((b) => b.id).sort()).toEqual(['100', '101', '102', '200']);
    expect(scan.bookmarks.find((b) => b.id === '100')).toMatchObject({
      title: 'GitHub',
      parentId: '10',
      rootId: '1',
      path: ['开发'],
    });
  });

  it('跳过不可修改节点及其整个子树', () => {
    expect(scan.bookmarks.some((b) => b.id === '110')).toBe(false);
    expect(scan.folders.some((f) => f.id === '11')).toBe(false);
  });

  it('目录记录相对根目录的路径与深度', () => {
    expect(scan.folders.find((f) => f.id === '10')).toMatchObject({
      path: ['开发'],
      depth: 1,
      rootId: '1',
    });
  });
});
