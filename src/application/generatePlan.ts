import type { EventsPort, ModelPort, StoragePort } from './ports';
import {
  MAX_EXISTING_PATH_DEPTH,
  dedupeTaxonomy,
  normalizeTargetPath,
  validateAssignmentBatch,
} from '../domain/organize/plan';
import { assertTransition } from '../domain/organize/stateMachine';
import { extractJsonObject } from '../infrastructure/model/openAICompatibleClient';
import {
  assignmentBatchPrompt,
  conservativeAssignmentBatchPrompt,
  taxonomyBatchPrompt,
  taxonomyMergePrompt,
} from '../infrastructure/model/prompts';
import { AppError } from '../shared/errors';
import {
  ModelAssignmentBatchSchema,
  ModelCandidateBatchSchema,
  ModelConservativeAssignmentBatchSchema,
  ModelTaxonomySchema,
  type FolderNameStyle,
  type JobState,
  type OrganizeMode,
  type PlanRecord,
  type ScannedBookmark,
} from '../shared/schemas';

/** 分批大小：同一阶段的批次并行请求，阶段之间仍按依赖顺序执行。 */
export const TAXONOMY_BATCH_SIZE = 100;
export const ASSIGN_BATCH_SIZE = 50;

export interface GeneratePlanDeps {
  model: ModelPort;
  storage: StoragePort;
  /** 默认保持历史行为：由 AI 重新规划目录。 */
  mode?: OrganizeMode;
  /** 重新规划目录时的文件夹命名风格。 */
  folderNameStyle?: FolderNameStyle;
  /** 保守模式可选的现有目录白名单，按 Chrome 系统根目录隔离。 */
  existingFolderPaths?: Array<{ rootId: string; path: string[] }>;
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

function existingPathsByRoot(
  folders: Array<{ rootId: string; path: string[] }>,
): Map<string, string[][]> {
  const grouped = new Map<string, string[][]>();
  const seen = new Map<string, Set<string>>();
  for (const folder of folders) {
    const path = normalizeTargetPath(folder.path, MAX_EXISTING_PATH_DEPTH);
    if (!path) continue;
    const key = path.map((segment) => segment.toLocaleLowerCase()).join('\u0000');
    const rootSeen = seen.get(folder.rootId) ?? new Set<string>();
    if (rootSeen.has(key)) continue;
    rootSeen.add(key);
    seen.set(folder.rootId, rootSeen);
    const paths = grouped.get(folder.rootId) ?? [];
    paths.push(path);
    grouped.set(folder.rootId, paths);
  }
  return grouped;
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
 * 恢复语义：已有 plan 记录时从其 phase 与连续游标继续；
 * 尚未按顺序落盘的并行批次会在恢复时重新请求。
 */
export async function generatePlan(
  deps: GeneratePlanDeps,
  job: JobState,
  bookmarks: ScannedBookmark[],
  existingFolderNames: string[],
  onProgress?: (p: GeneratePlanProgress) => void,
): Promise<PlanRecord> {
  const { model, storage } = deps;
  const mode = deps.mode ?? 'reorganize';
  const folderNameStyle = deps.folderNameStyle ?? 'text';
  const now = deps.now ?? (() => Date.now());
  const total = bookmarks.length;
  const conservativePaths = existingPathsByRoot(deps.existingFolderPaths ?? []);

  if (mode === 'conservative') {
    const rootsWithoutFolders = new Set(
      bookmarks
        .filter((bookmark) => (conservativePaths.get(bookmark.rootId)?.length ?? 0) === 0)
        .map((bookmark) => bookmark.rootId),
    );
    if (rootsWithoutFolders.size > 0) {
      throw new AppError('validation', '保守模式下，部分所选书签所在区域没有可用的现有文件夹');
    }
  }

  const existing = await storage.loadPlan();
  const plan: PlanRecord =
    existing &&
    existing.jobId === job.jobId &&
    (existing.mode ?? 'reorganize') === mode &&
    (existing.folderNameStyle ?? 'text') === folderNameStyle
      ? existing
      : {
          jobId: job.jobId,
          createdAt: now(),
          mode,
          folderNameStyle,
          phase: mode === 'conservative' ? 'assign' : 'taxonomy',
          taxonomyCandidates: [],
          taxonomyCursor: 0,
          taxonomy:
            mode === 'conservative'
              ? [...conservativePaths.values()].flat()
              : [],
          assignments: [],
          assignCursor: 0,
        };

  if (mode === 'conservative' && plan.assignCursor === 0) {
    onProgress?.({ phase: 'taxonomy', processed: total, total });
    await storage.savePlan(plan);
  }

  // ---- 阶段一：分类体系 ----
  if (plan.phase === 'taxonomy') {
    // 扫描结束时任务已处于 planning；只有从 scanning 进入时才需要断言迁移。
    // 恢复场景（planning/classifying/failed/reviewing）直接续跑。
    if (job.status === 'scanning') {
      assertTransition(job.status, 'planning');
    }
    const batches = chunk(bookmarks, TAXONOMY_BATCH_SIZE);
    const pendingBatchIndexes = batches
      .map((_, index) => index)
      .filter((index) => index >= plan.taxonomyCursor);
    let completedTaxonomyBatches = plan.taxonomyCursor;
    const taxonomyResults = await Promise.allSettled(
      pendingBatchIndexes.map(async (index) => {
        const content = await model.chat(
          taxonomyBatchPrompt(batches[index]!, existingFolderNames, folderNameStyle),
          deps.signal,
        );
        const parsed = parseWith(ModelCandidateBatchSchema, content, '候选目录');
        completedTaxonomyBatches += 1;
        onProgress?.({
          phase: 'taxonomy',
          processed: Math.min(completedTaxonomyBatches * TAXONOMY_BATCH_SIZE, total),
          total,
        });
        return parsed.candidates;
      }),
    );

    // 网络请求并行执行；结果按原批次顺序合并并落盘，避免并发写同一份 plan。
    for (let offset = 0; offset < taxonomyResults.length; offset++) {
      const result = taxonomyResults[offset]!;
      if (result.status === 'rejected') throw result.reason;
      plan.taxonomyCandidates = dedupeTaxonomy([
        ...plan.taxonomyCandidates,
        ...result.value,
      ]);
      plan.taxonomyCursor = pendingBatchIndexes[offset]! + 1;
      await storage.savePlan(plan);
    }

    const merged = await model.chat(
      taxonomyMergePrompt(plan.taxonomyCandidates, folderNameStyle),
      deps.signal,
    );
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
    const batches = chunk(bookmarks, ASSIGN_BATCH_SIZE);
    const startBatch = Math.floor(plan.assignCursor / ASSIGN_BATCH_SIZE);
    const pendingBatchIndexes = batches
      .map((_, index) => index)
      .filter((index) => index >= startBatch);
    let completedAssignBatches = startBatch;
    const assignmentResults = await Promise.allSettled(
      pendingBatchIndexes.map(async (index) => {
        const batch = batches[index]!;
        const batchIds = new Set(batch.map((bookmark) => bookmark.id));
        const content = await model.chat(
          mode === 'conservative'
            ? conservativeAssignmentBatchPrompt(conservativePaths, batch)
            : assignmentBatchPrompt(plan.taxonomy, batch, folderNameStyle),
          deps.signal,
        );
        const parsed =
          mode === 'conservative'
            ? parseWith(ModelConservativeAssignmentBatchSchema, content, '书签分配')
            : parseWith(ModelAssignmentBatchSchema, content, '书签分配');
        const allowedExistingPaths =
          mode === 'conservative'
            ? new Map(
                batch.map((bookmark) => [
                  bookmark.id,
                  conservativePaths.get(bookmark.rootId) ?? [],
                ]),
              )
            : undefined;
        const validation = validateAssignmentBatch(
          parsed.assignments,
          batchIds,
          allowedExistingPaths,
        );
        completedAssignBatches += 1;
        onProgress?.({
          phase: 'assign',
          processed: Math.min(completedAssignBatches * ASSIGN_BATCH_SIZE, total),
          total,
        });
        return { batchIds, ...validation };
      }),
    );

    // 与分类阶段相同：请求并行，合并与持久化保持确定顺序。
    for (let offset = 0; offset < assignmentResults.length; offset++) {
      const result = assignmentResults[offset]!;
      if (result.status === 'rejected') throw result.reason;
      const { batchIds, valid, rejected } = result.value;
      plan.assignments = [
        ...plan.assignments.filter((assignment) => !batchIds.has(assignment.bookmarkId)),
        ...valid,
      ];
      plan.assignCursor = Math.min(
        (pendingBatchIndexes[offset]! + 1) * ASSIGN_BATCH_SIZE,
        total,
      );
      await storage.savePlan(plan);

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
