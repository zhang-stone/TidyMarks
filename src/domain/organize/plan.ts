import type { Assignment, ScannedBookmark } from '../../shared/schemas';

/** 目录名最大长度，避免个别服务对超长标题的处理差异。 */
export const MAX_SEGMENT_LENGTH = 100;
export const MAX_PATH_DEPTH = 2;

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

/**
 * 清理目录名：去掉控制字符、折叠空白、去掉首尾空白。
 * 返回空字符串表示该名称不可用。
 */
export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, MAX_SEGMENT_LENGTH);
}

/**
 * 规整目标路径：逐段清理、去掉空段、最多两级。
 * 路径无效（清理后为空）时返回 null。
 */
export function normalizeTargetPath(path: string[]): string[] | null {
  const segments = path
    .map((s) => sanitizeFolderName(s))
    .filter((s) => s.length > 0)
    .slice(0, MAX_PATH_DEPTH);
  return segments.length > 0 ? segments : null;
}

/** 目录体系去重（不区分大小写、保留首个出现的写法；[A] 与 [A,B] 属不同路径，均保留）。 */
export function dedupeTaxonomy(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const raw of paths) {
    const path = normalizeTargetPath(raw);
    if (!path) continue;
    const key = path.map((s) => s.toLowerCase()).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

export interface AssignmentValidation {
  valid: Assignment[];
  rejected: Array<{ bookmarkId: string; reason: string }>;
}

/**
 * 校验模型产出的一批分配结果（架构方案第 6.3 节）：
 * - bookmarkId 必须属于本次选择范围；
 * - 每条书签最多一个目标（重复取第一条，其余进入 rejected）；
 * - 路径非空、层级不超过两级、名称经过清理。
 */
export function validateAssignmentBatch(
  raw: Array<{ bookmarkId: string; targetPath: string[]; reason?: string }>,
  allowedBookmarkIds: ReadonlySet<string>,
): AssignmentValidation {
  const valid: Assignment[] = [];
  const rejected: Array<{ bookmarkId: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!allowedBookmarkIds.has(item.bookmarkId)) {
      rejected.push({ bookmarkId: item.bookmarkId, reason: 'unknown_bookmark' });
      continue;
    }
    if (seen.has(item.bookmarkId)) {
      rejected.push({ bookmarkId: item.bookmarkId, reason: 'duplicate_target' });
      continue;
    }
    const path = normalizeTargetPath(item.targetPath);
    if (!path) {
      rejected.push({ bookmarkId: item.bookmarkId, reason: 'invalid_path' });
      continue;
    }
    seen.add(item.bookmarkId);
    valid.push({ bookmarkId: item.bookmarkId, targetPath: path, reason: item.reason });
  }

  return { valid, rejected };
}

/** 从扫描结果中提取域名，供模型分批特征使用。 */
export function bookmarkDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** 提取书签的模型输入特征（标题 + 域名 + 原路径）。 */
export function bookmarkFeatureLine(bookmark: ScannedBookmark): string {
  const domain = bookmarkDomain(bookmark.url);
  const path = bookmark.path.length > 0 ? bookmark.path.join(' / ') : '';
  return JSON.stringify({
    id: bookmark.id,
    title: bookmark.title,
    domain,
    currentPath: path,
  });
}
