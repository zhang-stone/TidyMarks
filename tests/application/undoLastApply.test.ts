import { describe, expect, it } from 'vitest';
import { undoLastApply } from '@/src/application/undoLastApply';
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
          { id: '100', parentId: '1', index: 2, title: 'GitHub', url: 'https://github.com' },
          { id: '101', parentId: '1', index: 3, title: 'MDN', url: 'https://developer.mozilla.org' },
        ],
      },
    ],
  },
];

const bookmarks: ScannedBookmark[] = [
  { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '1', rootId: '1', path: [] },
  { id: '101', title: 'MDN', url: 'https://developer.mozilla.org', parentId: '1', rootId: '1', path: [] },
];

const assignments: Assignment[] = [
  { bookmarkId: '100', targetPath: ['开发'] },
  { bookmarkId: '101', targetPath: ['开发'] },
];

describe('undoLastApply', () => {
  it('完整撤销：书签按原位置移回并删除新建空目录', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const applied = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);
    const devFolder = bm.nodes().find((n) => n.title === '开发');

    const result = await undoLastApply(
      { bookmarks: bm, storage },
      { ...applied.job, status: 'completed' },
    );

    expect(result.job.status).toBe('undone');
    expect(result.conflicts).toHaveLength(0);
    expect(bm.nodes().find((n) => n.id === '100')?.parentId).toBe('1');
    expect(bm.nodes().find((n) => n.id === '101')?.parentId).toBe('1');
    // 新建目录被删除。
    expect(bm.nodes().find((n) => n.id === devFolder?.id)).toBeUndefined();
    // 恢复原顺序：index 2 在 index 3 之前。
    const b100 = bm.nodes().find((n) => n.id === '100');
    const b101 = bm.nodes().find((n) => n.id === '101');
    expect((b100?.index ?? 0) < (b101?.index ?? 0)).toBe(true);
  });

  it('用户二次移动的书签跳过并报冲突，不覆盖新操作', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const applied = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);

    // 用户把 101 移到别处（书签栏根）。
    await bm.move('101', { parentId: '1' });

    const result = await undoLastApply(
      { bookmarks: bm, storage },
      { ...applied.job, status: 'completed' },
    );

    expect(result.job.status).toBe('partially_undone');
    expect(result.conflicts).toEqual([
      { bookmarkId: '101', kind: 'user_conflict', message: expect.stringContaining('再次移动') },
    ]);
    expect(bm.nodes().find((n) => n.id === '100')?.parentId).toBe('1');
  });

  it('已删除书签跳过并报冲突', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const applied = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);
    await bm.removeTree('100');

    const result = await undoLastApply(
      { bookmarks: bm, storage },
      { ...applied.job, status: 'completed' },
    );

    expect(result.job.status).toBe('partially_undone');
    expect(result.conflicts[0]).toMatchObject({ bookmarkId: '100', kind: 'user_conflict' });
  });

  it('撤销后新建目录中仍有用户书签时不删除该目录', async () => {
    const bm = createMemoryBookmarks(tree);
    const storage = createMemoryStorage();
    const applied = await applyPlan({ bookmarks: bm, storage }, makeJob(), bookmarks, assignments);
    const devFolder = bm.nodes().find((n) => n.title === '开发');

    // 用户在“开发”目录里新放一条书签（不移动原有书签）。
    await bm.move('100', { parentId: '1', index: 5 });
    const created = await bm.createFolder(devFolder!.id, '用户目录');
    void created;

    // 先让两条书签都“被用户移动”，撤销会跳过它们 → 目录非空，不删除。
    const result = await undoLastApply(
      { bookmarks: bm, storage },
      { ...applied.job, status: 'completed' },
    );
    expect(result.job.status).toBe('partially_undone');
    expect(bm.nodes().find((n) => n.id === devFolder?.id)).toBeDefined();
  });
});
