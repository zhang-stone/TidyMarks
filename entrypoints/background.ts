import { defineBackground } from 'wxt/utils/define-background';
import { scanBookmarks } from '@/src/application/scanBookmarks';
import { applyPlan } from '@/src/application/applyPlan';
import { undoLastApply } from '@/src/application/undoLastApply';
import { resumeJob } from '@/src/application/resumeJob';
import { deleteDuplicateBookmarks } from '@/src/application/deleteDuplicateBookmarks';
import type { EventsPort, StoragePort } from '@/src/application/ports';
import { createBookmarksRepository } from '@/src/infrastructure/chrome/bookmarksRepository';
import {
  createStorageRepository,
  enforceTrustedContexts,
} from '@/src/infrastructure/chrome/storageRepository';
import { canTransition } from '@/src/domain/organize/stateMachine';
import { classifyError } from '@/src/shared/errors';
import { parseRequest, type RequestMessage } from '@/src/shared/messages';
import type { JobState } from '@/src/shared/schemas';

const DASHBOARD_URL = chrome.runtime.getURL('/dashboard.html');

/**
 * Service Worker：所有书签写操作的唯一入口（架构方案第 3.2 节）。
 * - 点击扩展图标时打开或复用 Dashboard 标签页；
 * - 消息路由：所有入站消息经 Zod 校验，未知命令直接拒绝；
 * - 进度/结果事件 fire-and-forget 广播，Dashboard 不在线时忽略发送失败。
 */

function createEventsPort(): EventsPort {
  const fireAndForget = (message: unknown): void => {
    void chrome.runtime.sendMessage(message).catch(() => {
      // 没有接收方（Dashboard 关闭）时忽略。
    });
  };
  return {
    progress: (jobId, status, processed, total) =>
      fireAndForget({ type: 'JOB_PROGRESS', jobId, status, processed, total }),
    completed: (job) => fireAndForget({ type: 'JOB_COMPLETED', jobId: job.jobId, job }),
    interrupted: (job) => fireAndForget({ type: 'JOB_INTERRUPTED', jobId: job.jobId, job }),
    failed: (job) => fireAndForget({ type: 'JOB_FAILED', jobId: job.jobId, job }),
  };
}

/** 打开或复用唯一的全页 Dashboard 标签页（扩展对自己的 origin 有访问权，无需 tabs 权限）。 */
async function openDashboard(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${DASHBOARD_URL}*` });
  const existing = tabs[0];
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true }).catch(() => undefined);
    }
    return;
  }
  await chrome.tabs.create({ url: DASHBOARD_URL, active: true });
}

/** 扫描请求的任务解析：可从当前状态继续时复用，否则换新任务重新开始。 */
async function resolveJobForScan(storage: StoragePort, jobId: string): Promise<JobState> {
  const existing = await storage.loadJob();
  if (existing && existing.jobId === jobId && canTransition(existing.status, 'scanning')) {
    return existing;
  }
  return {
    jobId,
    status: 'idle',
    updatedAt: Date.now(),
    applyCursor: 0,
    appliedIds: [],
    createdFolderIds: [],
    cancelRequested: false,
    failures: [],
  };
}

async function handleScan(storage: StoragePort, jobId: string): Promise<unknown> {
  const job = await resolveJobForScan(storage, jobId);
  const scan = await scanBookmarks(
    { bookmarks: createBookmarksRepository(), storage, events: createEventsPort() },
    job,
  );
  const saved = await storage.loadJob();
  return { scan, job: saved ?? job };
}

async function handleApply(storage: StoragePort, jobId: string): Promise<unknown> {
  const job = await storage.loadJob();
  const scan = await storage.loadScan();
  const plan = await storage.loadPlan();
  if (!job || job.jobId !== jobId) {
    throw new Error('任务不存在或已过期，请重新扫描');
  }
  if (!scan) {
    throw new Error('没有可用的扫描结果，请先扫描');
  }
  if (!plan || plan.jobId !== job.jobId) {
    throw new Error('没有可用的分类方案，请先生成方案');
  }
  const result = await applyPlan(
    { bookmarks: createBookmarksRepository(), storage, events: createEventsPort() },
    job,
    scan.bookmarks,
    plan.assignments,
    { createMissingFolders: plan.mode !== 'conservative' },
  );
  return { job: result.job };
}

async function handleUndo(storage: StoragePort, jobId: string): Promise<unknown> {
  const job = await storage.loadJob();
  if (!job || job.jobId !== jobId) {
    throw new Error('任务不存在或已过期');
  }
  const result = await undoLastApply(
    { bookmarks: createBookmarksRepository(), storage, events: createEventsPort() },
    job,
  );
  return { job: result.job, conflicts: result.conflicts };
}

/** 标记取消：写入持久化标志，应用/撤销循环在每个书签之间重读检查。 */
async function handleCancel(storage: StoragePort, jobId: string): Promise<unknown> {
  const job = await storage.loadJob();
  if (!job || job.jobId !== jobId) {
    throw new Error('任务不存在或已过期');
  }
  const cancelled: JobState = { ...job, cancelRequested: true, updatedAt: Date.now() };
  await storage.saveJob(cancelled);
  return { job: cancelled };
}

/** 失败时把任务落为 failed 状态并广播，保证 Dashboard 重开后可恢复。 */
async function markFailed(storage: StoragePort, jobId: string | null, error: unknown): Promise<void> {
  if (!jobId) return;
  const job = await storage.loadJob();
  if (!job || job.jobId !== jobId) return;
  const classified = classifyError(error);
  const failed: JobState = {
    ...job,
    status: 'failed',
    error: { kind: classified.kind, message: classified.message },
    updatedAt: Date.now(),
  };
  try {
    await storage.saveJob(failed);
    createEventsPort().failed(failed);
  } catch {
    // 状态落盘失败时只能放弃，避免错误循环。
  }
}

export default defineBackground(() => {
  void enforceTrustedContexts().catch(() => undefined);

  chrome.action.onClicked.addListener(() => {
    void openDashboard();
  });

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const request: RequestMessage | null = parseRequest(raw);
    if (!request) {
      sendResponse({
        ok: false,
        requestId: typeof (raw as { requestId?: unknown })?.requestId === 'string'
          ? (raw as { requestId: string }).requestId
          : '',
        error: { kind: 'validation', message: '未知或非法的命令' },
      });
      return false;
    }

    const storage = createStorageRepository(chrome.storage.local);
    const requestId = request.requestId;
    const jobId = 'jobId' in request ? request.jobId : null;

    void (async () => {
      try {
        let payload: unknown;
        switch (request.type) {
          case 'GET_STATUS':
            payload = await resumeJob({ storage });
            break;
          case 'SCAN_BOOKMARKS':
            payload = await handleScan(storage, request.jobId);
            break;
          case 'APPLY_PLAN':
          case 'RETRY_FAILED':
            payload = await handleApply(storage, request.jobId);
            break;
          case 'UNDO_LAST_APPLY':
            payload = await handleUndo(storage, request.jobId);
            break;
          case 'CANCEL_JOB':
            payload = await handleCancel(storage, request.jobId);
            break;
          case 'DELETE_DUPLICATE_BOOKMARKS':
            payload = await deleteDuplicateBookmarks(
              { bookmarks: createBookmarksRepository(), storage },
              request.bookmarkIds,
            );
            break;
        }
        sendResponse({ ok: true, requestId, payload });
      } catch (error) {
        await markFailed(storage, jobId, error);
        sendResponse({ ok: false, requestId, error: classifyError(error) });
      }
    })();

    // 异步响应：保持消息通道开放。
    return true;
  });
});
