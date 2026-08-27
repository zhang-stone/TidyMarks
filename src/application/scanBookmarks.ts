import type { BookmarksPort, EventsPort, StoragePort } from './ports';
import { buildScanResult } from '../domain/bookmarks/tree';
import { assertTransition } from '../domain/organize/stateMachine';
import type { JobState, ScanResult } from '../shared/schemas';

export interface ScanDeps {
  bookmarks: BookmarksPort;
  storage: StoragePort;
  events?: EventsPort;
  now?: () => number;
  newId?: () => string;
}

/**
 * 扫描整棵书签树并持久化一次一致的结果。
 * 由 Service Worker 调用；Dashboard 通过消息触发。
 */
export async function scanBookmarks(deps: ScanDeps, job: JobState): Promise<ScanResult> {
  const { storage, bookmarks, events } = deps;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  assertTransition(job.status, 'scanning');
  const working: JobState = { ...job, status: 'scanning', updatedAt: now() };
  await storage.saveJob(working);

  const tree = await bookmarks.getTree();
  const scan = buildScanResult(tree, newId(), now());
  await storage.saveScan(scan);

  const done: JobState = { ...working, status: 'planning', updatedAt: now() };
  await storage.saveJob(done);
  events?.progress(done.jobId, done.status, scan.bookmarks.length, scan.bookmarks.length);
  return scan;
}
