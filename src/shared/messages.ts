import { z } from 'zod';
import {
  JobStateSchema,
  ScanResultSchema,
  FailureItemSchema,
  JOB_STATUSES,
} from './schemas';

/**
 * Dashboard 与 Service Worker 之间的类型化协议。
 * 所有消息都必须通过 Zod 校验，未知命令直接拒绝（见架构方案第 11、12 节）。
 */

// ---------- 请求（Dashboard → Service Worker） ----------

export const GetStatusRequestSchema = z.object({
  type: z.literal('GET_STATUS'),
  requestId: z.string(),
});

export const ScanBookmarksRequestSchema = z.object({
  type: z.literal('SCAN_BOOKMARKS'),
  requestId: z.string(),
  jobId: z.string(),
});

export const ApplyPlanRequestSchema = z.object({
  type: z.literal('APPLY_PLAN'),
  requestId: z.string(),
  jobId: z.string(),
});

export const RetryFailedRequestSchema = z.object({
  type: z.literal('RETRY_FAILED'),
  requestId: z.string(),
  jobId: z.string(),
});

export const UndoLastApplyRequestSchema = z.object({
  type: z.literal('UNDO_LAST_APPLY'),
  requestId: z.string(),
  jobId: z.string(),
});

export const CancelJobRequestSchema = z.object({
  type: z.literal('CANCEL_JOB'),
  requestId: z.string(),
  jobId: z.string(),
});

export const DeleteDuplicateBookmarksRequestSchema = z.object({
  type: z.literal('DELETE_DUPLICATE_BOOKMARKS'),
  requestId: z.string(),
  bookmarkIds: z.array(z.string()).min(1),
});

export const DeleteEmptyFoldersRequestSchema = z.object({
  type: z.literal('DELETE_EMPTY_FOLDERS'),
  requestId: z.string(),
  folderIds: z.array(z.string()).min(1),
});

export const RequestSchema = z.discriminatedUnion('type', [
  GetStatusRequestSchema,
  ScanBookmarksRequestSchema,
  ApplyPlanRequestSchema,
  RetryFailedRequestSchema,
  UndoLastApplyRequestSchema,
  CancelJobRequestSchema,
  DeleteDuplicateBookmarksRequestSchema,
  DeleteEmptyFoldersRequestSchema,
]);
export type RequestMessage = z.infer<typeof RequestSchema>;

// ---------- 响应（Service Worker → Dashboard） ----------

export const ResponseSchema = z.union([
  z.object({ ok: z.literal(true), requestId: z.string(), payload: z.unknown() }),
  z.object({
    ok: z.literal(false),
    requestId: z.string(),
    error: FailureItemSchema,
  }),
]);
export type ResponseMessage = z.infer<typeof ResponseSchema>;

// ---------- 事件（Service Worker → Dashboard 广播） ----------

export const JobProgressEventSchema = z.object({
  type: z.literal('JOB_PROGRESS'),
  jobId: z.string(),
  status: z.enum(JOB_STATUSES),
  processed: z.number(),
  total: z.number(),
});

export const JobCompletedEventSchema = z.object({
  type: z.literal('JOB_COMPLETED'),
  jobId: z.string(),
  job: JobStateSchema,
});

export const JobInterruptedEventSchema = z.object({
  type: z.literal('JOB_INTERRUPTED'),
  jobId: z.string(),
  job: JobStateSchema,
});

export const JobFailedEventSchema = z.object({
  type: z.literal('JOB_FAILED'),
  jobId: z.string(),
  job: JobStateSchema,
});

export const EventSchema = z.discriminatedUnion('type', [
  JobProgressEventSchema,
  JobCompletedEventSchema,
  JobInterruptedEventSchema,
  JobFailedEventSchema,
]);
export type EventMessage = z.infer<typeof EventSchema>;

/**
 * 校验入站消息；非法或未知类型返回 null，由调用方直接拒绝。
 * 这是边界校验，消息来自同一扩展内的页面，但仍按架构方案要求严格校验。
 */
export function parseRequest(raw: unknown): RequestMessage | null {
  const result = RequestSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** GET_STATUS 的响应载荷：任务、扫描和撤销可用性。 */
export interface StatusPayload {
  job: JobStateSchemaType;
  scan: ScanResultSchemaType | null;
  hasUndoSnapshot: boolean;
}
type JobStateSchemaType = z.infer<typeof JobStateSchema>;
type ScanResultSchemaType = z.infer<typeof ScanResultSchema>;
