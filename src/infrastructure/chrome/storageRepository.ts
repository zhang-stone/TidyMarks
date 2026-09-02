import type { StoragePort } from '../../application/ports';
import { AppError } from '../../shared/errors';
import {
  JobStateSchema,
  ModelSettingsSchema,
  PlanRecordSchema,
  ScanResultSchema,
  STORAGE_KEYS,
  STORAGE_QUOTA_LIMIT_BYTES,
  UndoSnapshotSchema,
  type JobState,
  type ModelSettings,
  type PlanRecord,
  type ScanResult,
  type UndoSnapshot,
} from '../../shared/schemas';

import type { z } from 'zod';

/**
 * chrome.storage.local 适配实现。
 * - 读取时经 Zod 校验，损坏数据返回 null 而不是抛出；
 * - 写入前检查已用空间，接近配额时拒绝并提示（架构方案第 10 节）。
 */
export function createStorageRepository(area: chrome.storage.StorageArea): StoragePort {
  // 泛型约束到具体 Schema 类型，规避 ZodType<Output, Input> 在 .default() 上的变型问题。
  async function read<S extends z.ZodTypeAny>(key: string, schema: S): Promise<z.infer<S> | null> {
    const raw = (await area.get(key))[key];
    if (raw === undefined || raw === null) return null;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async function write(key: string, value: unknown): Promise<void> {
    const used = await area.getBytesInUse(null);
    if (used >= STORAGE_QUOTA_LIMIT_BYTES) {
      throw new AppError('storage_quota', 'errors.storageQuota');
    }
    await area.set({ [key]: value });
  }

  return {
    loadModelSettings: () => read(STORAGE_KEYS.modelSettings, ModelSettingsSchema),
    saveModelSettings: (settings: ModelSettings) =>
      write(STORAGE_KEYS.modelSettings, ModelSettingsSchema.parse(settings)),

    loadJob: () => read(STORAGE_KEYS.job, JobStateSchema),
    saveJob: (job: JobState) => write(STORAGE_KEYS.job, JobStateSchema.parse(job)),

    loadScan: () => read(STORAGE_KEYS.scan, ScanResultSchema),
    saveScan: (scan: ScanResult) => write(STORAGE_KEYS.scan, ScanResultSchema.parse(scan)),

    loadPlan: () => read(STORAGE_KEYS.plan, PlanRecordSchema),
    savePlan: (plan: PlanRecord) => write(STORAGE_KEYS.plan, PlanRecordSchema.parse(plan)),

    loadUndo: () => read(STORAGE_KEYS.undo, UndoSnapshotSchema),
    saveUndo: (snapshot: UndoSnapshot) =>
      write(STORAGE_KEYS.undo, UndoSnapshotSchema.parse(snapshot)),

    async clear(keys) {
      const storageKeys = keys.map((k) => STORAGE_KEYS[k]);
      await area.remove(storageKeys);
    },
  };
}

/** 扩展启动时调用：限制 storage.local 仅可信上下文可访问。 */
export async function enforceTrustedContexts(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
