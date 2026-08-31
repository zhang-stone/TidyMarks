import { describe, expect, it } from 'vitest';
import { applyPlan } from '@/src/application/applyPlan';
import { undoLastApply } from '@/src/application/undoLastApply';
import type { BookmarkNode } from '@/src/domain/bookmarks/types';
import type { Assignment, ScannedBookmark } from '@/src/shared/schemas';
import {
  createMemoryBookmarks,
  createMemoryStorage,
  makeJob,
} from '../helpers/memoryAdapters';

const tree: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: '书签栏',
        children: [
          { id: '100', parentId: '1', index: 0, title: 'GitHub', url: 'https://github.com' },
          { id: '101', parentId: '1', index: 1, title: 'MDN', url: 'https://developer.mozilla.org' },
          { id: '102', parentId: '1', index: 2, title: '淘宝', url: 'https://taobao.com' },
        ],
      },
    ],
  },
];

const bookmarks: ScannedBookmark[] = [
  { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '1', rootId: '1', path: [] },
  { id: '101', title: 'MDN', url: 'https://developer.mozilla.org', parentId: '1', rootId: '1', path: [] },
  { id: '102', title: '淘宝', url: 'https://taobao.com', parentId: '1', rootId: '1', path: [] },
];

const assignments: Assignment[] = [
  { bookmarkId: '100', targetPath: ['开发'] },
  { bookmarkId: '101', targetPath: ['开发', '前端'] },
  { bookmarkId: '102', targetPath: ['购物'] },
];

describe('applyPlan', () => {
  it('按路径逐级创建目录并顺序移动书签', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const result = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);

    expect(result.job.status).toBe('completed');
    expect(result.appliedIds.sort()).toEqual(['100', '101', '102']);

    const nodes = bm.nodes();
    const dev = nodes.find((n) => n.title === '开发');
    const fe = nodes.find((n) => n.title === '前端');
    expect(dev?.parentId).toBe('1');
    expect(fe?.parentId).toBe(dev?.id);
    expect(nodes.find((n) => n.id === '100')?.parentId).toBe(dev?.id);
    expect(nodes.find((n) => n.id === '101')?.parentId).toBe(fe?.id);
    // 撤销快照记录了原始位置。
    const undo = storage.dump().undo;
    expect(undo?.moves.find((m) => m.bookmarkId === '100')).toMatchObject({
      fromParentId: '1',
      fromIndex: 0,
    });
  });

  it('复用同一父目录下名称相同的现有文件夹（幂等）', async () => {
    const withExisting: BookmarkNode[] = [
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
                id: '50',
                parentId: '1',
                index: 0,
                title: '开发',
                children: [],
              },
              { id: '100', parentId: '1', index: 1, title: 'GitHub', url: 'https://github.com' },
            ],
          },
        ],
      },
    ];
    const bm = createMemoryBookmarks(withExisting);
    const storage = createMemoryStorage();
    await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, [assignments[0]!]);

    // 不新建目录，书签移入已存在的“开发”。
    expect(bm.nodes().filter((n) => n.title === '开发')).toHaveLength(1);
    expect(bm.nodes().find((n) => n.id === '100')?.parentId).toBe('50');
  });

  it('同一 jobId 重复应用从游标继续，不重复移动', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const first = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);

    const movedCount = () => bm.nodes().filter((n) => n.id === '100').length;
    expect(movedCount()).toBe(1);

    // 二次进入（模拟恢复）应直接跳过已应用项。
    const second = await applyPlan(
      { bookmarks: bm, storage },
      { ...first.job, status: 'applying' },
      bookmarks,
      assignments,
    );
    expect(second.job.status).toBe('completed');
    expect(second.appliedIds.sort()).toEqual(['100', '101', '102']);
    expect(movedCount()).toBe(1);
  });

  it('扫描后书签被删除时记为失败而不中断', async () => {
    const bm = createMemoryBookmarks(tree);
    await bm.removeTree('101');
    const storage = createMemoryStorage();
    const result = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);

    expect(result.job.status).toBe('completed');
    expect(result.failures).toEqual([
      { bookmarkId: '101', kind: 'validation', message: '书签已不存在，跳过' },
    ]);
    expect(result.appliedIds.sort()).toEqual(['100', '102']);
  });

  it('保守模式不创建已不存在的目标目录', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const result = await applyPlan(
      { bookmarks: bm, storage },
      makeJob(),
      bookmarks,
      [assignments[0]!],
      { createMissingFolders: false },
    );

    expect(bm.nodes().some((node) => node.title === '开发')).toBe(false);
    expect(result.appliedIds).toEqual([]);
    expect(result.failures).toEqual([
      {
        bookmarkId: '100',
        kind: 'validation',
        message: '保守模式的目标文件夹已不存在，已跳过',
      },
    ]);
  });

  // 被搬空的原文件夹（含向上冒泡的空父目录）应删除并记入撤销快照，非空目录保留。
  const nestedTree: BookmarkNode[] = [
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
              id: '20',
              parentId: '1',
              index: 0,
              title: '外层',
              children: [
                {
                  id: '21',
                  parentId: '20',
                  index: 0,
                  title: '内层',
                  children: [
                    { id: '100', parentId: '21', index: 0, title: 'GitHub', url: 'https://github.com' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  const nestedBookmark: ScannedBookmark[] = [
    { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '21', rootId: '1', path: [] },
  ];
  const nestedAssignment: Assignment[] = [{ bookmarkId: '100', targetPath: ['开发'] }];

  it('清理被搬空的原文件夹并向上冒泡，非空目录保留', async () => {
    const bm = createMemoryBookmarks(nestedTree);
    const storage = createMemoryStorage();
    await applyPlan({ bookmarks: bm, storage }, makeJob(), nestedBookmark, nestedAssignment);

    // 内层、外层均被搬空 → 都删除；书签移入新建的“开发”。
    expect(bm.nodes().some((n) => n.id === '21')).toBe(false);
    expect(bm.nodes().some((n) => n.id === '20')).toBe(false);
    const dev = bm.nodes().find((n) => n.title === '开发');
    expect(bm.nodes().find((n) => n.id === '100')?.parentId).toBe(dev?.id);

    const deleted = storage.dump().undo?.deletedFolders ?? [];
    expect(deleted.map((d) => d.id).sort()).toEqual(['20', '21']);
    expect(deleted.find((d) => d.id === '21')).toMatchObject({ parentId: '20', title: '内层' });
  });

  it('保留仍含其它书签的原文件夹', async () => {
    const withSibling: BookmarkNode[] = [
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
                id: '20',
                parentId: '1',
                index: 0,
                title: '外层',
                children: [
                  { id: '100', parentId: '20', index: 0, title: 'GitHub', url: 'https://github.com' },
                  { id: '199', parentId: '20', index: 1, title: '未整理', url: 'https://keep.me' },
                ],
              },
            ],
          },
        ],
      },
    ];
    const bm = createMemoryBookmarks(withSibling);
    const storage = createMemoryStorage();
    await applyPlan(
      { bookmarks: bm, storage },
      makeJob(),
      [{ id: '100', title: 'GitHub', url: 'https://github.com', parentId: '20', rootId: '1', path: [] }],
      nestedAssignment,
    );

    // “外层”仍含未整理书签 199 → 不删除。
    expect(bm.nodes().some((n) => n.id === '20')).toBe(true);
    expect(storage.dump().undo?.deletedFolders ?? []).toEqual([]);
  });

  it('撤销时重建被删原文件夹并把书签移回', async () => {
    const bm = createMemoryBookmarks(nestedTree);
    const storage = createMemoryStorage();
    const applied = await applyPlan(
      { bookmarks: bm, storage },
      makeJob(),
      nestedBookmark,
      nestedAssignment,
    );
    expect(bm.nodes().some((n) => n.id === '20')).toBe(false);

    const undone = await undoLastApply({ bookmarks: bm, storage }, applied.job);
    expect(undone.job.status).toBe('undone');
    expect(undone.conflicts).toEqual([]);

    // 外层/内层按层级重建（新 id），书签移回内层，新建的“开发”被清空删除。
    const outer = bm.nodes().find((n) => n.title === '外层');
    const inner = bm.nodes().find((n) => n.title === '内层');
    expect(outer?.parentId).toBe('1');
    expect(inner?.parentId).toBe(outer?.id);
    expect(bm.nodes().find((n) => n.id === '100')?.parentId).toBe(inner?.id);
    expect(bm.nodes().some((n) => n.title === '开发')).toBe(false);
  });
});
