import type { BookmarkNode } from '../domain/bookmarks/types';
import type {
  JobState,
  ModelSettings,
  PlanRecord,
  ScanResult,
  UndoSnapshot,
} from '../shared/schemas';

/**
 * application 层依赖的外部能力接口，由 infrastructure 层实现（架构方案第 4 节）。
 */

export interface BookmarksPort {
  getTree(): Promise<BookmarkNode[]>;
  get(id: string): Promise<BookmarkNode | undefined>;
  getChildren(parentId: string): Promise<BookmarkNode[]>;
  createFolder(parentId: string, title: string): Promise<{ id: string }>;
  move(id: string, destination: { parentId: string; index?: number }): Promise<void>;
  removeTree(id: string): Promise<void>;
}

export interface StoragePort {
  loadModelSettings(): Promise<ModelSettings | null>;
  saveModelSettings(settings: ModelSettings): Promise<void>;
  loadJob(): Promise<JobState | null>;
  saveJob(job: JobState): Promise<void>;
  loadScan(): Promise<ScanResult | null>;
  saveScan(scan: ScanResult): Promise<void>;
  loadPlan(): Promise<PlanRecord | null>;
  savePlan(plan: PlanRecord): Promise<void>;
  loadUndo(): Promise<UndoSnapshot | null>;
  saveUndo(snapshot: UndoSnapshot): Promise<void>;
  clear(keys: Array<'plan' | 'scan'>): Promise<void>;
}

/** 任务进度广播；Dashboard 关闭时发送失败也必须可忽略（fire-and-forget）。 */
export interface EventsPort {
  progress(jobId: string, status: JobState['status'], processed: number, total: number): void;
  completed(job: JobState): void;
  interrupted(job: JobState): void;
  failed(job: JobState): void;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 模型客户端：输入聊天消息，返回文本内容；重试与限流由实现内部处理。 */
export interface ModelPort {
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
}

/** 测试连接与保存设置时申请 Base URL 精确 Origin 的权限。 */
export interface PermissionsPort {
  ensureOriginPermission(baseUrl: string): Promise<boolean>;
  removeOriginPermission(baseUrl: string): Promise<void>;
}
