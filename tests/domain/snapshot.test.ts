import { describe, expect, it } from 'vitest';
import {
  decideRestore,
  orderFoldersForDeletion,
  orderRestores,
} from '@/src/domain/undo/snapshot';
import type { UndoMove, UndoSnapshot } from '@/src/shared/schemas';

const move = (over: Partial<UndoMove>): UndoMove => ({
  bookmarkId: 'b',
  fromParentId: 'p',
  fromIndex: 0,
  toFolderId: 't',
  ...over,
});

describe('decideRestore', () => {
  it('书签仍在目标目录且原父目录存在时恢复', () => {
    expect(decideRestore(move({}), { parentId: 't' }, true)).toMatchObject({ action: 'restore' });
  });

  it('书签缺失 / 原父目录缺失 / 被用户移动时跳过', () => {
    expect(decideRestore(move({}), undefined, true)).toMatchObject({
      action: 'skip',
      reason: 'bookmark_missing',
    });
    expect(decideRestore(move({}), { parentId: 't' }, false)).toMatchObject({
      action: 'skip',
      reason: 'parent_missing',
    });
    expect(decideRestore(move({}), { parentId: 'other' }, true)).toMatchObject({
      action: 'skip',
      reason: 'moved_by_user',
    });
  });
});

describe('orderRestores', () => {
  it('按原父目录分组，组内按原 index 升序', () => {
    const ordered = orderRestores([
      move({ bookmarkId: 'b2', fromParentId: 'p1', fromIndex: 5 }),
      move({ bookmarkId: 'b1', fromParentId: 'p2', fromIndex: 0 }),
      move({ bookmarkId: 'b0', fromParentId: 'p1', fromIndex: 1 }),
    ]);
    expect(ordered.map((m) => m.bookmarkId)).toEqual(['b0', 'b2', 'b1']);
  });
});

describe('orderFoldersForDeletion', () => {
  it('深度从深到浅排序', () => {
    const snapshot: UndoSnapshot = {
      jobId: 'j',
      createdAt: 0,
      moves: [],
      createdFolders: [
        { id: 'shallow', depth: 1 },
        { id: 'deep', depth: 3 },
        { id: 'mid', depth: 2 },
      ],
    };
    expect(orderFoldersForDeletion(snapshot.createdFolders)).toEqual(['deep', 'mid', 'shallow']);
  });
});
