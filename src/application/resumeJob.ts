import type { StoragePort } from './ports';
import type { JobState, PlanRecord } from '../shared/schemas';
import type { StatusPayload } from '../shared/messages';

export interface ResumeDeps {
  storage: StoragePort;
}

export interface ResumeView extends StatusPayload {
  plan: PlanRecord | null;
  /** 当前任务是否可以从持久化游标继续写入。 */
  canResumeApply: boolean;
  /** 是否存在属于当前任务的、可继续的模型管线。 */
  canResumePlanning: boolean;
}

/**
 * Dashboard 重开后的状态恢复（架构方案第 12 节）：
 * 通过 GET_STATUS 拉齐 job / scan / plan / undo 快照，重建界面所需的一切，
 * 不依赖长连接或内存状态。
 */
export async function resumeJob(deps: ResumeDeps): Promise<ResumeView> {
  const [job, scan, plan, undo] = await Promise.all([
    deps.storage.loadJob(),
    deps.storage.loadScan(),
    deps.storage.loadPlan(),
    deps.storage.loadUndo(),
  ]);

  const currentJob: JobState =
    job ?? {
      jobId: crypto.randomUUID(),
      status: 'idle',
      updatedAt: Date.now(),
      applyCursor: 0,
      appliedIds: [],
      createdFolderIds: [],
      cancelRequested: false,
      failures: [],
    };

  const jobMatches = (record: { jobId: string } | null): boolean =>
    record !== null && record.jobId === currentJob.jobId;

  return {
    job: currentJob,
    // scan 结果不携带 jobId，直接返回；新一轮扫描会覆盖它。
    scan,
    hasUndoSnapshot: undo !== null && jobMatches(undo),
    plan: plan && jobMatches(plan) ? plan : null,
    // interrupted = 用户中断；applying = SW 在写入中途被回收，两者都可从持久化游标续跑。
    canResumeApply: currentJob.status === 'interrupted' || currentJob.status === 'applying',
    canResumePlanning:
      plan !== null &&
      jobMatches(plan) &&
      plan.phase !== 'done' &&
      (currentJob.status === 'planning' ||
        currentJob.status === 'classifying' ||
        currentJob.status === 'failed' ||
        currentJob.status === 'reviewing'),
  };
}
