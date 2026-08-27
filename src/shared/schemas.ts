import { z } from 'zod';
import { ERROR_KINDS } from './errors';

/**
 * 持久化数据与模型响应共用的 Zod Schema。
 * 存储 key 见 docs/技术架构方案 第 10 节：
 * settings:model / job:current / scan:current / plan:current / undo:latest
 */

export const STORAGE_KEYS = {
  modelSettings: 'settings:model',
  job: 'job:current',
  scan: 'scan:current',
  plan: 'plan:current',
  undo: 'undo:latest',
} as const;

/** 写入 chrome.storage.local 前允许的最大已用空间（接近 10 MB 配额时停止）。 */
export const STORAGE_QUOTA_LIMIT_BYTES = 9.5 * 1024 * 1024;

// ---------- 模型设置 ----------

export const ModelSettingsSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: '仅支持 HTTPS 的 API Base URL' }),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

// ---------- 扫描结果 ----------

export const ScanRootSchema = z.object({
  id: z.string(),
  title: z.string(),
});
export type ScanRoot = z.infer<typeof ScanRootSchema>;

export const ScanFolderSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  rootId: z.string(),
  title: z.string(),
  /** 相对于所在根目录的目录名路径（不含根目录自身）。 */
  path: z.array(z.string()),
  depth: z.number().int().nonnegative(),
});
export type ScanFolder = z.infer<typeof ScanFolderSchema>;

export const ScannedBookmarkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  parentId: z.string(),
  rootId: z.string(),
  /** 书签所在目录相对于根目录的目录名路径（不含根目录自身）。 */
  path: z.array(z.string()),
});
export type ScannedBookmark = z.infer<typeof ScannedBookmarkSchema>;

export const ScanResultSchema = z.object({
  scanId: z.string(),
  scannedAt: z.number(),
  roots: z.array(ScanRootSchema),
  folders: z.array(ScanFolderSchema),
  bookmarks: z.array(ScannedBookmarkSchema),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ---------- 分类方案 ----------

const PathSegmentSchema = z.string().min(1).max(100);
/** AI 路径最多两级、至少一级（“未分类”等单级目录也合法）。 */
export const TargetPathSchema = z.array(PathSegmentSchema).min(1).max(2);

export const AssignmentSchema = z.object({
  bookmarkId: z.string(),
  targetPath: TargetPathSchema,
  reason: z.string().optional(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const PlanRecordSchema = z.object({
  jobId: z.string(),
  createdAt: z.number(),
  phase: z.enum(['taxonomy', 'assign', 'done']),
  /** 分类体系阶段各批次产出的候选目录，用于断点续跑。 */
  taxonomyCandidates: z.array(z.array(PathSegmentSchema).min(1).max(2)).default([]),
  /** 已完成的分类体系批次数。 */
  taxonomyCursor: z.number().int().nonnegative().default(0),
  /** 合并后的最终目录体系，全部为不超过两级的路径。 */
  taxonomy: z.array(TargetPathSchema).default([]),
  assignments: z.array(AssignmentSchema).default([]),
  /** 已完成分配的书签数游标，恢复时从这里继续。 */
  assignCursor: z.number().int().nonnegative().default(0),
});
export type PlanRecord = z.infer<typeof PlanRecordSchema>;

// ---------- 任务状态 ----------

export const JOB_STATUSES = [
  'idle',
  'scanning',
  'planning',
  'classifying',
  'reviewing',
  'applying',
  'completed',
  'interrupted',
  'undoing',
  'undone',
  'partially_undone',
  'failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const FailureItemSchema = z.object({
  bookmarkId: z.string().optional(),
  kind: z.enum(ERROR_KINDS),
  message: z.string(),
});
export type FailureItem = z.infer<typeof FailureItemSchema>;

export const JobStateSchema = z.object({
  jobId: z.string(),
  status: z.enum(JOB_STATUSES),
  updatedAt: z.number(),
  /** apply 阶段成功移动的书签数游标。 */
  applyCursor: z.number().int().nonnegative().default(0),
  appliedIds: z.array(z.string()).default([]),
  /** apply 阶段新建的目录 ID（撤销时只删除这些目录中的空目录）。 */
  createdFolderIds: z.array(z.string()).default([]),
  /** 用户请求中断写入的标志，Service Worker 在每条写入之间检查。 */
  cancelRequested: z.boolean().default(false),
  failures: z.array(FailureItemSchema).default([]),
  error: FailureItemSchema.optional(),
});
export type JobState = z.infer<typeof JobStateSchema>;

// ---------- 撤销快照 ----------

export const UndoMoveSchema = z.object({
  bookmarkId: z.string(),
  fromParentId: z.string(),
  fromIndex: z.number().int().nonnegative(),
  toFolderId: z.string(),
});
export type UndoMove = z.infer<typeof UndoMoveSchema>;

export const UndoSnapshotSchema = z.object({
  jobId: z.string(),
  createdAt: z.number(),
  moves: z.array(UndoMoveSchema),
  createdFolders: z.array(
    z.object({ id: z.string(), depth: z.number().int().nonnegative() }),
  ),
});
export type UndoSnapshot = z.infer<typeof UndoSnapshotSchema>;

// ---------- 模型响应 ----------

/** 模型按批次返回的候选目录。 */
export const ModelCandidateBatchSchema = z.object({
  candidates: z.array(z.array(z.string()).min(1).max(2)),
});
export type ModelCandidateBatch = z.infer<typeof ModelCandidateBatchSchema>;

/** 合并后的最终目录体系。 */
export const ModelTaxonomySchema = z.object({
  categories: z.array(z.array(z.string()).min(1).max(2)),
});
export type ModelTaxonomy = z.infer<typeof ModelTaxonomySchema>;

/** 分配阶段模型只能返回这三个字段，不能返回任何 Chrome 节点 ID。 */
export const ModelAssignmentBatchSchema = z.object({
  assignments: z.array(
    z.object({
      bookmarkId: z.string(),
      targetPath: z.array(z.string()).min(1).max(2),
      reason: z.string().optional(),
    }),
  ),
});
export type ModelAssignmentBatch = z.infer<typeof ModelAssignmentBatchSchema>;
