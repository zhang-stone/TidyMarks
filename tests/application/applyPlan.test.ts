import { describe, expect, it } from 'vitest';
import { applyPlan } from '@/src/application/applyPlan';
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
});
