import { describe, expect, it } from 'vitest';
import { generatePlan } from '@/src/application/generatePlan';
import type { ModelPort, ChatMessage } from '@/src/application/ports';
import type { ScannedBookmark } from '@/src/shared/schemas';
import { createMemoryStorage, makeJob } from '../helpers/memoryAdapters';

const bookmarks: ScannedBookmark[] = Array.from({ length: 3 }, (_, i) => ({
  id: `b${i}`,
  title: `Bookmark ${i}`,
  url: `https://example.com/${i}`,
  parentId: '1',
  rootId: '1',
  path: [],
}));

/** 顺序脚本化的假模型：按调用次数返回预置响应。 */
function scriptedModel(responses: string[]): ModelPort & { calls: string[] } {
  let call = 0;
  const calls: string[] = [];
  return {
    calls,
    async chat(messages: ChatMessage[]) {
      calls.push(messages.map((m) => m.role).join(','));
      const content = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return content;
    },
  };
}

describe('generatePlan', () => {
  it('两阶段完成并只保留合法分配', async () => {
    const model = scriptedModel([
      '{"candidates": [["开发"], ["购物"]]}', // 阶段一批次
      '{"categories": [["开发"], ["购物"]]}', // 合并
      JSON.stringify({
        assignments: [
          { bookmarkId: 'b0', targetPath: ['开发'], reason: '代码' },
          { bookmarkId: 'b0', targetPath: ['购物'] }, // 重复目标 → 拒绝
          { bookmarkId: 'unknown', targetPath: ['开发'] }, // 未知书签 → 拒绝
          { bookmarkId: 'b1', targetPath: ['购物'] },
        ],
      }),
    ]);
    const storage = createMemoryStorage();
    const plan = await generatePlan({ model, storage }, makeJob({ status: 'planning' }), bookmarks, []);

    expect(plan.phase).toBe('done');
    expect(plan.taxonomy).toEqual([['开发'], ['购物']]);
    expect(plan.assignments.map((a) => a.bookmarkId)).toEqual(['b0', 'b1']);
    expect(plan.assignments[0]).toMatchObject({ targetPath: ['开发'] });
  });

  it('恢复时从游标继续，不重跑已完成批次', async () => {
    // 三个书签、分配批次大小 50 → 一个批次；这里用两次调用模拟中断续跑。
    const firstModel = scriptedModel([
      '{"candidates": [["开发"]]}',
      '{"categories": [["开发"]]}',
      // 第三次调用抛出非 JSON，模拟页面关闭前的失败。
      'not json at all {{{',
    ]);
    const storage = createMemoryStorage();
    const job = makeJob({ status: 'planning' });

    await expect(
      generatePlan({ model: firstModel, storage }, job, bookmarks, []),
    ).rejects.toThrow();

    const saved = storage.dump().plan!;
    expect(saved.phase).toBe('assign'); // 目录体系已完成并持久化

    // 恢复：只重跑分配批次。
    const resumeModel = scriptedModel([
      '{"assignments": [{"bookmarkId": "b2", "targetPath": ["开发"]}]}',
    ]);
    const plan = await generatePlan({ model: resumeModel, storage }, job, bookmarks, []);
    expect(plan.assignments.map((a) => a.bookmarkId)).toEqual(['b2']);
  });

  it('目录体系为空时抛出 invalid_response', async () => {
    const model = scriptedModel([
      '{"candidates": [["开发"]]}',
      '{"categories": []}',
    ]);
    const storage = createMemoryStorage();
    await expect(
      generatePlan({ model, storage }, makeJob({ status: 'planning' }), bookmarks, []),
    ).rejects.toThrow('没有产出任何可用目录');
  });
});
