import type { EventsPort, ModelPort, StoragePort } from './ports';
import { dedupeTaxonomy, validateAssignmentBatch } from '../domain/organize/plan';
import { assertTransition } from '../domain/organize/stateMachine';
import { extractJsonObject } from '../infrastructure/model/openAICompatibleClient';
import {
  assignmentBatchPrompt,
  taxonomyBatchPrompt,
  taxonomyMergePrompt,
} from '../infrastructure/model/prompts';
import { AppError } from '../shared/errors';
import {
  ModelAssignmentBatchSchema,
  ModelCandidateBatchSchema,
  ModelTaxonomySchema,
  type JobState,
  type PlanRecord,
  type ScannedBookmark,
} from '../shared/schemas';

/** 分批大小：先顺序请求，不并发轰炸用户 API（架构方案第 6.2 节）。 */
export const TAXONOMY_BATCH_SIZE = 100;
export const ASSIGN_BATCH_SIZE = 50;

export interface GeneratePlanDeps {
  model: ModelPort;
  storage: StoragePort;
  events?: EventsPort;
  now?: () => number;
  signal?: AbortSignal;
}

export interface GeneratePlanProgress {
  phase: 'taxonomy' | 'assign' | 'done';
  processed: number;
  total: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseWith<S extends { parse(value: unknown): unknown }>(
  schema: S,
  content: string,
  what: string,
): ReturnType<S['parse']> {
  try {
    return schema.parse(extractJsonObject(content)) as ReturnType<S['parse']>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('invalid_response', `模型响应不符合${what}的格式要求`);
  }
}

/**
 * 两阶段、可恢复的模型管线（架构方案第 6.2 节）：
 * 1. 分类体系生成：分批产出候选目录 → 合并为最多两级的统一体系；
 * 2. 书签分配：固定体系分批分类，每批完成立即持久化结果与游标。
 *
 * 恢复语义：已有 plan 记录时从其 phase 与游标继续，
 * 页面意外关闭最多丢失当前未完成的那个请求。
 */
export async function generatePlan(
  deps: GeneratePlanDeps,
  job: JobState,
  bookmarks: ScannedBookmark[],
  existingFolderNames: string[],
  onProgress?: (p: GeneratePlanProgress) => void,
): Promise<PlanRecord> {
  const { model, storage } = deps;
  const now = deps.now ?? (() => Date.now());
  const total = bookmarks.length;

  const existing = await storage.loadPlan();
  const plan: PlanRecord =
    existing && existing.jobId === job.jobId
      ? existing
      : {
          jobId: job.jobId,
          createdAt: now(),
          phase: 'taxonomy',
          taxonomyCandidates: [],
          taxonomyCursor: 0,
          taxonomy: [],
          assignments: [],
          assignCursor: 0,
        };

  // ---- 阶段一：分类体系 ----
  if (plan.phase === 'taxonomy') {
    // 扫描结束时任务已处于 planning；只有从 scanning 进入时才需要断言迁移。
    // 恢复场景（planning/classifying/failed/reviewing）直接续跑。
    if (job.status === 'scanning') {
      assertTransition(job.status, 'planning');
    }
    const batches = chunk(bookmarks, TAXONOMY_BATCH_SIZE);
    // 游标记录已完成的批次数；页面关闭只丢失当前未完成请求，恢复后从下一批继续。
    for (let i = plan.taxonomyCursor; i < batches.length; i++) {
      const batch = batches[i]!;
      const content = await model.chat(
        taxonomyBatchPrompt(batch, existingFolderNames),
        deps.signal,
      );
      const parsed = parseWith(ModelCandidateBatchSchema, content, '候选目录');
      plan.taxonomyCandidates = dedupeTaxonomy([...plan.taxonomyCandidates, ...parsed.candidates]);
      plan.taxonomyCursor = i + 1;
      await storage.savePlan(plan);
      onProgress?.({ phase: 'taxonomy', processed: Math.min((i + 1) * TAXONOMY_BATCH_SIZE, total), total });
    }

    const merged = await model.chat(taxonomyMergePrompt(plan.taxonomyCandidates), deps.signal);
    const parsedMerge = parseWith(ModelTaxonomySchema, merged, '目录体系');
    plan.taxonomy = dedupeTaxonomy(parsedMerge.categories);
    if (plan.taxonomy.length === 0) {
      throw new AppError('invalid_response', '模型没有产出任何可用目录');
    }
    plan.phase = 'assign';
    await storage.savePlan(plan);
    onProgress?.({ phase: 'taxonomy', processed: total, total });
  }

  // ---- 阶段二：书签分配 ----
  if (plan.phase === 'assign') {
    const allowedIds = new Set(bookmarks.map((b) => b.id));
    const batches = chunk(bookmarks, ASSIGN_BATCH_SIZE);
    const startBatch = Math.floor(plan.assignCursor / ASSIGN_BATCH_SIZE);

    for (let i = startBatch; i < batches.length; i++) {
      const batch = batches[i]!;
      const batchIds = new Set(batch.map((b) => b.id));
      const content = await model.chat(assignmentBatchPrompt(plan.taxonomy, batch), deps.signal);
      const parsed = parseWith(ModelAssignmentBatchSchema, content, '书签分配');
      const { valid, rejected } = validateAssignmentBatch(parsed.assignments, allowedIds);

      // 覆盖本批次书签的旧分配（恢复或重试时幂等）。
      plan.assignments = [
        ...plan.assignments.filter((a) => !batchIds.has(a.bookmarkId)),
        ...valid,
      ];
      plan.assignCursor = (i + 1) * ASSIGN_BATCH_SIZE;
      await storage.savePlan(plan);
      onProgress?.({ phase: 'assign', processed: Math.min(plan.assignCursor, total), total });

      if (rejected.length > 0) {
        // 被拒绝项不算硬失败：它们会在完成后以失败项形式展示。
        console.warn('部分书签分配被校验拒绝', rejected);
      }
    }
    plan.phase = 'done';
    await storage.savePlan(plan);
    onProgress?.({ phase: 'done', processed: total, total });
  }

  return plan;
}

/** 未分配到书签补一个兜底目标之外的状态：完成后由 Dashboard 汇总展示。 */
export function unassignedBookmarkIds(
  plan: PlanRecord,
  bookmarks: ScannedBookmark[],
): string[] {
  const assigned = new Set(plan.assignments.map((a) => a.bookmarkId));
  return bookmarks.filter((b) => !assigned.has(b.id)).map((b) => b.id);
}
