import type { JobStatus } from '../../shared/schemas';

/**
 * 任务状态机（架构方案第 5 节）。
 * failed 之后允许重新开始扫描，也允许从持久化游标重试失败的应用（MVP 执行结果页的“重试”入口）；
 * undone/partially_undone 为终态或允许重试撤销。
 */
const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  idle: ['scanning'],
  scanning: ['planning', 'failed'],
  planning: ['classifying', 'failed'],
  classifying: ['reviewing', 'failed'],
  reviewing: ['applying', 'scanning'],
  applying: ['completed', 'interrupted', 'failed'],
  interrupted: ['applying', 'undoing'],
  completed: ['undoing'],
  undoing: ['undone', 'partially_undone', 'failed'],
  undone: ['scanning'],
  partially_undone: ['undoing', 'scanning'],
  failed: ['scanning', 'applying'],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`非法任务状态迁移: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/** 同一时间只允许一个会修改书签的任务：这两个状态期间拒绝新的应用请求。 */
export function isWriteLocked(status: JobStatus): boolean {
  return status === 'applying' || status === 'undoing';
}
