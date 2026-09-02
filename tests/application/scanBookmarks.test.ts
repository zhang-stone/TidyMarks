import { describe, expect, it } from 'vitest';
import { scanBookmarks } from '@/src/application/scanBookmarks';
import { IllegalTransitionError } from '@/src/domain/organize/stateMachine';
import { fixtureTree } from '../domain/tree.test';
import {
  createMemoryBookmarks,
  createMemoryStorage,
  makeJob,
} from '../helpers/memoryAdapters';

describe('scanBookmarks', () => {
  it('扫描并持久化结果，任务进入 planning', async () => {
    const bookmarks = createMemoryBookmarks(fixtureTree());
    const storage = createMemoryStorage();
    const events: string[] = [];
    let clock = 0;

    const scan = await scanBookmarks(
      {
        bookmarks,
        storage,
        events: {
          progress: (...args) => events.push(args.join(':')),
          completed: () => undefined,
          interrupted: () => undefined,
          failed: () => undefined,
        },
        now: () => ++clock,
        newId: () => 'scan-42',
      },
      makeJob({ status: 'idle' }),
    );

    expect(scan.scanId).toBe('scan-42');
    expect(scan.bookmarks).toHaveLength(4); // 不可修改子树被跳过
    expect(storage.dump().scan).toEqual(scan);
    expect(storage.dump().job?.status).toBe('planning');
    expect(events).toHaveLength(1);
  });

  it('非法状态迁移直接拒绝', async () => {
    const bookmarks = createMemoryBookmarks(fixtureTree());
    const storage = createMemoryStorage();
    await expect(
      scanBookmarks({ bookmarks, storage }, makeJob({ status: 'completed' })),
    ).rejects.toThrow(IllegalTransitionError);
  });
});
