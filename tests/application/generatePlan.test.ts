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

  it('保守模式跳过目录规划，并只接受已有目录路径', async () => {
    const model = scriptedModel([
      JSON.stringify({
        assignments: [
          { bookmarkId: 'b0', targetPath: ['现有', '深层', '目录'] },
          { bookmarkId: 'b1', targetPath: ['模型新建'] },
          { bookmarkId: 'b2', targetPath: ['资料'] },
        ],
      }),
    ]);
    const storage = createMemoryStorage();
    const plan = await generatePlan(
      {
        model,
        storage,
        mode: 'conservative',
        existingFolderPaths: [
          { rootId: '1', path: ['现有', '深层', '目录'] },
          { rootId: '1', path: ['资料'] },
        ],
      },
      makeJob({ status: 'planning' }),
      bookmarks,
      [],
    );

    expect(model.calls).toHaveLength(1);
    expect(plan.mode).toBe('conservative');
    expect(plan.taxonomy).toEqual([['现有', '深层', '目录'], ['资料']]);
    expect(plan.assignments).toEqual([
      { bookmarkId: 'b0', targetPath: ['现有', '深层', '目录'] },
      { bookmarkId: 'b2', targetPath: ['资料'] },
    ]);
  });

  it('保守模式在书签所在区域没有现有文件夹时给出明确错误', async () => {
    const model = scriptedModel([]);
    await expect(
      generatePlan(
        { model, storage: createMemoryStorage(), mode: 'conservative' },
        makeJob({ status: 'planning' }),
        bookmarks,
        [],
      ),
    ).rejects.toThrow('没有可用的现有文件夹');
    expect(model.calls).toHaveLength(0);
  });

  it('同一阶段的多个模型批次并行请求', async () => {
    const manyBookmarks: ScannedBookmark[] = Array.from({ length: 101 }, (_, index) => ({
      id: `p${index}`,
      title: `Parallel ${index}`,
      url: `https://example.com/parallel/${index}`,
      parentId: '1',
      rootId: '1',
      path: [],
    }));
    let activeTaxonomy = 0;
    let maxActiveTaxonomy = 0;
    let activeAssignments = 0;
    let maxActiveAssignments = 0;

    const model: ModelPort = {
      async chat(messages) {
        const content = messages.at(-1)?.content ?? '';
        if (content.includes('候选分类目录')) {
          activeTaxonomy += 1;
          maxActiveTaxonomy = Math.max(maxActiveTaxonomy, activeTaxonomy);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          activeTaxonomy -= 1;
          return '{"candidates": [["开发"]]}';
        }
        if (content.includes('请合并为一套')) {
          return '{"categories": [["开发"]]}';
        }

        activeAssignments += 1;
        maxActiveAssignments = Math.max(maxActiveAssignments, activeAssignments);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        activeAssignments -= 1;
        const ids = [...content.matchAll(/"id":"(p\d+)"/g)].map((match) => match[1]);
        return JSON.stringify({
          assignments: ids.map((bookmarkId) => ({ bookmarkId, targetPath: ['开发'] })),
        });
      },
    };

    const plan = await generatePlan(
      { model, storage: createMemoryStorage() },
      makeJob({ status: 'planning' }),
      manyBookmarks,
      [],
    );

    expect(maxActiveTaxonomy).toBe(2);
    expect(maxActiveAssignments).toBe(3);
    expect(plan.assignments).toHaveLength(101);
  });

  it('图标加文字风格会写入目录生成提示词和方案记录', async () => {
    const prompts: ChatMessage[][] = [];
    const responses = [
      '{"candidates": [["💻 开发"]]}',
      '{"categories": [["💻 开发"]]}',
      JSON.stringify({
        assignments: bookmarks.map((bookmark) => ({
          bookmarkId: bookmark.id,
          targetPath: ['💻 开发'],
        })),
      }),
    ];
    const model: ModelPort = {
      async chat(messages) {
        prompts.push(messages);
        return responses[prompts.length - 1]!;
      },
    };

    const plan = await generatePlan(
      { model, storage: createMemoryStorage(), folderNameStyle: 'emoji' },
      makeJob({ status: 'planning' }),
      bookmarks,
      [],
    );

    expect(prompts[0]?.[0]?.content).toContain('以一个语义匹配的 emoji 开头');
    expect(prompts[1]?.[0]?.content).toContain('以一个语义匹配的 emoji 开头');
    expect(plan.folderNameStyle).toBe('emoji');
    expect(plan.taxonomy).toEqual([['💻 开发']]);
  });
});
