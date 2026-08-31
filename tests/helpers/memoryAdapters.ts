import type { BookmarksPort, StoragePort } from '@/src/application/ports';
import type { BookmarkNode } from '@/src/domain/bookmarks/types';
import type {
  JobState,
  ModelSettings,
  PlanRecord,
  ScanResult,
  UndoSnapshot,
} from '@/src/shared/schemas';

/**
 * 内存版 BookmarksPort：模拟 chrome.bookmarks 的最小行为
 * （创建目录、移动、按 id/parentId 查询、删除子树）。
 */
export function createMemoryBookmarks(initial: BookmarkNode[]): BookmarksPort & {
  nodes(): BookmarkNode[];
} {
  const store = new Map<string, BookmarkNode>();
  const index = new Map<string, string[]>(); // parentId -> child ids（顺序即 index）

  const reindex = (): void => {
    index.clear();
    const sorted = [...store.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const node of sorted) {
      if (!node.parentId) continue;
      const list = index.get(node.parentId) ?? [];
      list.push(node.id);
      index.set(node.parentId, list);
    }
  };

  // 递归展开整棵树，每个节点独立存一条记录。
  const flatten = (node: BookmarkNode): void => {
    store.set(node.id, { ...node, children: undefined });
    for (const child of node.children ?? []) flatten(child);
  };
  for (const node of initial) flatten(node);
  reindex();

  const flat = (): BookmarkNode[] => {
    const roots = [...store.values()].filter((n) => !n.parentId);
    const build = (node: BookmarkNode): BookmarkNode => {
      const childIds = index.get(node.id) ?? [];
      return { ...node, children: childIds.map((id) => build(store.get(id)!)) };
    };
    return roots.map(build);
  };

  let nextId = 1000;

  return {
    async getTree() {
      return flat();
    },
    async get(id) {
      return store.get(id);
    },
    async getChildren(parentId) {
      return (index.get(parentId) ?? []).map((id) => store.get(id)!);
    },
    async createFolder(parentId, title) {
      const id = `n${nextId++}`;
      const siblings = index.get(parentId) ?? [];
      const node: BookmarkNode = { id, parentId, title, index: siblings.length };
      store.set(id, node);
      siblings.push(id);
      index.set(parentId, siblings);
      return { id };
    },
    async move(id, destination) {
      const node = store.get(id);
      if (!node) throw new Error(`bookmark ${id} not found`);
      const oldList = index.get(node.parentId ?? '') ?? [];
      const oldPos = oldList.indexOf(id);
      if (oldPos >= 0) oldList.splice(oldPos, 1);
      const newList = index.get(destination.parentId) ?? [];
      const at = destination.index ?? newList.length;
      newList.splice(Math.min(at, newList.length), 0, id);
      node.parentId = destination.parentId;
      // 重算 index，保证与 chrome.bookmarks 语义一致。
      for (const [pid, ids] of index) {
        ids.forEach((cid, i) => {
          store.get(cid)!.index = i;
          void pid;
        });
      }
      reindex();
    },
    async remove(id) {
      const node = store.get(id);
      if (!node || node.url === undefined) throw new Error(`bookmark ${id} not found`);
      const siblings = index.get(node.parentId ?? '') ?? [];
      const position = siblings.indexOf(id);
      if (position >= 0) siblings.splice(position, 1);
      store.delete(id);
      reindex();
    },
    async removeTree(id) {
      const collect = (nid: string): string[] => {
        const kids = index.get(nid) ?? [];
        return [nid, ...kids.flatMap(collect)];
      };
      for (const nid of collect(id)) {
        const node = store.get(nid);
        if (node?.parentId) {
          const list = index.get(node.parentId) ?? [];
          const pos = list.indexOf(nid);
          if (pos >= 0) list.splice(pos, 1);
        }
        store.delete(nid);
        index.delete(nid);
      }
    },
    nodes() {
      return [...store.values()];
    },
  };
}

/** 内存版 StoragePort：按 key 保存各记录。 */
export function createMemoryStorage(initial: {
  job?: JobState;
  scan?: ScanResult;
  plan?: PlanRecord;
  undo?: UndoSnapshot;
  settings?: ModelSettings;
} = {}): StoragePort & {
  dump(): { job?: JobState; scan?: ScanResult; plan?: PlanRecord; undo?: UndoSnapshot };
} {
  const state = { ...initial };
  return {
    async loadModelSettings() {
      return state.settings ?? null;
    },
    async saveModelSettings(settings) {
      state.settings = settings;
    },
    async loadJob() {
      return state.job ?? null;
    },
    async saveJob(job) {
      state.job = job;
    },
    async loadScan() {
      return state.scan ?? null;
    },
    async saveScan(scan) {
      state.scan = scan;
    },
    async loadPlan() {
      return state.plan ?? null;
    },
    async savePlan(plan) {
      state.plan = plan;
    },
    async loadUndo() {
      return state.undo ?? null;
    },
    async saveUndo(snapshot) {
      state.undo = snapshot;
    },
    async clear(keys) {
      for (const key of keys) delete state[key];
    },
    dump() {
      return state;
    },
  };
}

export function makeJob(over: Partial<JobState> = {}): JobState {
  return {
    jobId: 'job-1',
    status: 'reviewing',
    updatedAt: 0,
    applyCursor: 0,
    appliedIds: [],
    createdFolderIds: [],
    cancelRequested: false,
    failures: [],
    ...over,
  };
}
