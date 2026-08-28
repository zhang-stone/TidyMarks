import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { generatePlan, type GeneratePlanProgress } from '@/src/application/generatePlan';
import type { ResumeView } from '@/src/application/resumeJob';
import type { ModelPort } from '@/src/application/ports';
import { createOpenAICompatibleClient } from '@/src/infrastructure/model/openAICompatibleClient';
import { createPermissionsRepository } from '@/src/infrastructure/chrome/permissionsRepository';
import {
  createStorageRepository,
} from '@/src/infrastructure/chrome/storageRepository';
import { sendRequest } from '@/src/infrastructure/chrome/messaging';
import { EventSchema, type RequestMessage } from '@/src/shared/messages';
import {
  ModelSettingsSchema,
  type Assignment,
  type FailureItem,
  type JobState,
  type ModelSettings,
  type OrganizeMode,
  type PlanRecord,
  type ScanResult,
  type ScannedBookmark,
} from '@/src/shared/schemas';
import { classifyError } from '@/src/shared/errors';
import { TreeView, createTreeCollection } from '@chakra-ui/react';

// ===== 类型定义 =====

type View = 'settings' | 'scan' | 'select' | 'organizing' | 'preview' | 'result';

interface AppState {
  view: View;
  settings: ModelSettings | null;
  job: JobState | null;
  scan: ScanResult | null;
  plan: PlanRecord | null;
  editedAssignments: Assignment[] | null;
  progress: GeneratePlanProgress | null;
  busy: string | null;
  error: string | null;
}

type Action =
  | { type: 'init'; settings: ModelSettings | null; status: ResumeView }
  | { type: 'view'; view: View }
  | { type: 'settingsSaved'; settings: ModelSettings }
  | { type: 'scanDone'; scan: ScanResult; job: JobState }
  | { type: 'planProgress'; progress: GeneratePlanProgress }
  | { type: 'planDone'; plan: PlanRecord }
  | { type: 'assignments'; assignments: Assignment[] }
  | { type: 'jobUpdate'; job: JobState }
  | { type: 'busy'; busy: string | null }
  | { type: 'error'; error: string | null };

const initialState: AppState = {
  view: 'settings',
  settings: null,
  job: null,
  scan: null,
  plan: null,
  editedAssignments: null,
  progress: null,
  busy: null,
  error: null,
};

function viewForStatus(status: ResumeView): View {
  const s = status.job.status;
  if (s === 'applying' || s === 'completed' || s === 'interrupted' || s === 'undoing') {
    return 'result';
  }
  if (status.plan && status.plan.phase === 'done') {
    return 'preview';
  }
  if (status.scan) {
    return 'scan';
  }
  return 'settings';
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'init':
      return {
        ...state,
        settings: action.settings,
        job: action.status.job,
        scan: action.status.scan,
        plan: action.status.plan,
        view: action.settings ? viewForStatus(action.status) : 'settings',
      };
    case 'view':
      return { ...state, view: action.view, error: null, progress: null };
    case 'settingsSaved':
      return { ...state, settings: action.settings, view: 'scan' };
    case 'scanDone':
      return { ...state, scan: action.scan, job: action.job, view: 'scan' };
    case 'planProgress':
      return { ...state, progress: action.progress };
    case 'planDone':
      return {
        ...state,
        plan: action.plan,
        editedAssignments: action.plan.assignments,
        view: 'preview',
        progress: null,
      };
    case 'assignments':
      return { ...state, editedAssignments: action.assignments };
    case 'jobUpdate':
      return { ...state, job: action.job };
    case 'busy':
      return { ...state, busy: action.busy, error: action.busy ? null : state.error };
    case 'error':
      return { ...state, error: action.error, busy: null };
  }
}

// ===== 步骤配置 =====

const STEPS = [
  { key: 'settings', label: '配置', num: 1 },
  { key: 'scan', label: '扫描', num: 2 },
  { key: 'organizing', label: '整理', num: 3 },
  { key: 'preview', label: '预览', num: 4 },
  { key: 'result', label: '完成', num: 5 },
] as const;

function getActiveStep(view: View, jobStatus?: string): number {
  switch (view) {
    case 'settings': return 1;
    case 'scan': return 2;
    case 'select': return 2;
    case 'organizing': return 3;
    case 'preview': return 4;
    case 'result':
      // 写入中仍属于步骤4
      if (jobStatus === 'applying' || jobStatus === 'undoing') return 4;
      return 5;
    default: return 1;
  }
}

function getHeaderTitle(view: View, jobStatus?: string): string {
  switch (view) {
    case 'settings': return '配置';
    case 'scan': return '扫描结果';
    case 'select': return '选择范围';
    case 'organizing': return 'AI 分析中';
    case 'preview': return '确认建议';
    case 'result':
      if (jobStatus === 'applying') return '写入中...';
      if (jobStatus === 'undoing') return '撤销中...';
      if (jobStatus === 'completed') return '已完成';
      return '执行结果';
    default: return '';
  }
}

// ===== 根组件 =====

const storage = createStorageRepository(chrome.storage.local);

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const jobIdRef = useRef<string>(crypto.randomUUID());
  // 用户在“AI 分析中”页点击返回时置位，避免异步方案结果强制跳转到预览页
  const organizingAbortRef = useRef(false);

  // 初始化：加载设置 + GET_STATUS 恢复界面
  useEffect(() => {
    void (async () => {
      try {
        const [settings, status] = await Promise.all([
          storage.loadModelSettings(),
          sendRequest({ type: 'GET_STATUS', requestId: crypto.randomUUID() }) as Promise<ResumeView>,
        ]);
        dispatch({ type: 'init', settings, status });
        if (status.job.jobId) jobIdRef.current = status.job.jobId;
      } catch (error) {
        dispatch({ type: 'error', error: classifyError(error).message });
      }
    })();
  }, []);

  // 订阅后台广播事件
  useEffect(() => {
    const listener = (raw: unknown): void => {
      const parsed = EventSchema.safeParse(raw);
      if (!parsed.success) return;
      const data = parsed.data;
      if (data.type === 'JOB_PROGRESS') return;
      dispatch({ type: 'jobUpdate', job: data.job });
      if (data.type === 'JOB_COMPLETED' || data.type === 'JOB_FAILED') {
        dispatch({ type: 'busy', busy: null });
        dispatch({ type: 'view', view: 'result' });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const runCommand = useCallback(async (command: RequestMessage, busy: string): Promise<unknown> => {
    dispatch({ type: 'busy', busy });
    try {
      return await sendRequest(command);
    } catch (error) {
      dispatch({ type: 'error', error: classifyError(error).message });
      return null;
    } finally {
      dispatch({ type: 'busy', busy: null });
    }
  }, []);

  const bookmarksById = useMemo(() => {
    const map = new Map<string, ScannedBookmark>();
    for (const b of state.scan?.bookmarks ?? []) map.set(b.id, b);
    return map;
  }, [state.scan]);

  const selectedBookmarks = useMemo(
    () =>
      (state.scan?.bookmarks ?? []).filter(
        (b) => !selectedIds || selectedIds.has(b.id),
      ),
    [state.scan, selectedIds],
  );

  const activeStep = getActiveStep(state.view, state.job?.status);
  const headerTitle = getHeaderTitle(state.view, state.job?.status);

  return (
    <>
      <AppHeader activeStep={activeStep} title={headerTitle} />
      {state.error && <div className="page-container"><div className="banner banner-error">{state.error}</div></div>}

      {state.view === 'settings' && (
        <SettingsPage
          initial={state.settings}
          onSaved={(settings) => dispatch({ type: 'settingsSaved', settings })}
          onError={(message) => dispatch({ type: 'error', error: message })}
        />
      )}

      {state.view === 'scan' && (
        <ScanPage
          scan={state.scan}
          busy={state.busy}
          onScan={async () => {
            jobIdRef.current = crypto.randomUUID();
            const payload = (await runCommand(
              { type: 'SCAN_BOOKMARKS', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
              '正在扫描书签',
            )) as { scan: ScanResult; job: JobState } | null;
            if (payload) {
              setSelectedIds(null);
              dispatch({ type: 'scanDone', scan: payload.scan, job: payload.job });
            }
          }}
          onNext={() => dispatch({ type: 'view', view: 'select' })}
          onBack={() => dispatch({ type: 'view', view: 'settings' })}
        />
      )}

      {state.view === 'select' && state.scan && (
        <SelectPage
          scan={state.scan}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onBack={() => dispatch({ type: 'view', view: 'scan' })}
          onGenerate={async (mode) => {
            if (!state.settings) return;
            organizingAbortRef.current = false;
            dispatch({ type: 'view', view: 'organizing' });
            dispatch({ type: 'busy', busy: '正在生成整理方案' });
            try {
              const client = createOpenAICompatibleClient(state.settings);
              const folderNames = (state.scan?.folders ?? []).map((f) => f.title);
              const currentJob: JobState =
                state.job && state.job.jobId === jobIdRef.current
                  ? state.job
                  : {
                      jobId: jobIdRef.current,
                      status: 'planning',
                      updatedAt: Date.now(),
                      applyCursor: 0,
                      appliedIds: [],
                      createdFolderIds: [],
                      cancelRequested: false,
                      failures: [],
                    };
              const plan = await generatePlan(
                {
                  model: client,
                  storage,
                  mode,
                  existingFolderPaths: (state.scan?.folders ?? []).map((folder) => ({
                    rootId: folder.rootId,
                    path: folder.path,
                  })),
                },
                currentJob,
                selectedBookmarks,
                folderNames,
                (p) => dispatch({ type: 'planProgress', progress: p }),
              );
              // 用户已返回上一步，丢弃本次结果，避免强制跳转
              if (organizingAbortRef.current) return;
              dispatch({ type: 'planDone', plan });
            } catch (error) {
              if (organizingAbortRef.current) return;
              dispatch({ type: 'error', error: classifyError(error).message });
              dispatch({ type: 'view', view: 'select' });
            } finally {
              dispatch({ type: 'busy', busy: null });
            }
          }}
        />
      )}

      {state.view === 'organizing' && (
        <OrganizingPage
          progress={state.progress}
          settings={state.settings}
          onBack={() => {
            organizingAbortRef.current = true;
            dispatch({ type: 'busy', busy: null });
            dispatch({ type: 'view', view: 'select' });
          }}
        />
      )}

      {state.view === 'preview' && state.plan && (
        <PreviewPage
          assignments={state.editedAssignments ?? state.plan.assignments}
          taxonomy={state.plan.taxonomy}
          bookmarksById={bookmarksById}
          onChange={(assignments) => dispatch({ type: 'assignments', assignments })}
          onBack={() => dispatch({ type: 'view', view: 'select' })}
          onApply={async () => {
            await storage.savePlan({ ...state.plan!, assignments: state.editedAssignments ?? [] });
            await runCommand(
              { type: 'APPLY_PLAN', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
              '正在应用整理方案',
            );
            dispatch({ type: 'view', view: 'result' });
          }}
        />
      )}

      {state.view === 'result' && state.job && (
        <ResultPage
          job={state.job}
          totalAssignments={state.editedAssignments?.length ?? state.plan?.assignments.length ?? 0}
          busy={state.busy}
          onRetry={() =>
            void runCommand(
              { type: 'RETRY_FAILED', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
              '正在重试失败项',
            )
          }
          onUndo={() =>
            void runCommand(
              { type: 'UNDO_LAST_APPLY', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
              '正在撤销最近一次整理',
            )
          }
          onCancel={() =>
            void runCommand(
              { type: 'CANCEL_JOB', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
              '正在请求中断',
            )
          }
          onNewRound={() => {
            jobIdRef.current = crypto.randomUUID();
            setSelectedIds(null);
            void storage.clear(['plan', 'scan']);
            dispatch({ type: 'view', view: 'scan' });
          }}
        />
      )}
    </>
  );
}

// ===== 顶部导航栏 =====

function AppHeader({ activeStep, title }: { activeStep: number; title: string }) {
  return (
    <header className="app-header">
      <div className="app-logo">
        <div className="app-logo-icon">
          <svg viewBox="0 0 24 24">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span>TidyMarks</span>
      </div>

      <div className="step-indicator">
        {STEPS.map((step, i) => (
          <span key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div className="step-item">
              <div
                className={`step-circle ${
                  step.num < activeStep ? 'completed' :
                  step.num === activeStep ? 'active' : ''
                }`}
              >
                {step.num < activeStep ? '✓' : step.num}
              </div>
              <span className={`step-label ${step.num === activeStep ? 'active' : ''}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`step-connector ${step.num < activeStep ? 'completed' : ''}`} />
            )}
          </span>
        ))}
      </div>

      <div className="header-title">{title}</div>
    </header>
  );
}

// ===== 模型配置页 =====

function SettingsPage(props: {
  initial: ModelSettings | null;
  onSaved: (settings: ModelSettings) => void;
  onError: (message: string) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(props.initial?.baseUrl ?? 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState(props.initial?.apiKey ?? '');
  const [model, setModel] = useState(props.initial?.model ?? 'gpt-4o-mini');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const permissions = createPermissionsRepository();

  const asSettings = (): ModelSettings | null => {
    const parsed = ModelSettingsSchema.safeParse({ baseUrl, apiKey, model });
    return parsed.success ? parsed.data : null;
  };

  const testConnection = async (): Promise<void> => {
    const settings = asSettings();
    if (!settings) {
      props.onError('请填写合法的 HTTPS Base URL、API Key 和模型名');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await permissions.ensureOriginPermission(settings.baseUrl);
      const client: ModelPort = createOpenAICompatibleClient(settings);
      await client.chat([{ role: 'user', content: '请回复 ok' }]);
      setTestResult('success');
      setTestMessage('连接成功，模型支持结构化输出');
    } catch (error) {
      setTestResult('error');
      setTestMessage(`连接失败：${classifyError(error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async (): Promise<void> => {
    const settings = asSettings();
    if (!settings) {
      props.onError('请填写合法的 HTTPS Base URL、API Key 和模型名');
      return;
    }
    try {
      const granted = await permissions.ensureOriginPermission(settings.baseUrl);
      if (!granted) {
        props.onError('未授予该 API 地址的访问权限');
        return;
      }
      await storage.saveModelSettings(settings);
      props.onSaved(settings);
    } catch (error) {
      props.onError(classifyError(error).message);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>模型配置</h1>
          <p>使用你自己的 API Key，数据不经过本扩展服务器</p>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label className="field-label">API BASE URL</label>
          <input
            className="field-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="field">
          <label className="field-label">API KEY</label>
          <input
            className="field-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <div className="field-helper">仅保存在 chrome.storage.local，不会上传</div>
        </div>
        <div className="field">
          <label className="field-label">MODEL</label>
          <input
            className="field-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>

        {testResult === 'success' && (
          <div className="banner banner-success">{testMessage}</div>
        )}
        {testResult === 'error' && (
          <div className="banner banner-error">{testMessage}</div>
        )}

        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={() => void testConnection()} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            下一步 →
          </button>
        </div>
      </div>

      <div className="info-card">
        <strong>兼容 OpenAI 格式的服务均可使用</strong>
        <br />
        支持 DeepSeek、Ollama、Azure OpenAI 等兼容 /v1/chat/completions 接口的服务。
      </div>
    </div>
  );
}

// ===== 扫描结果页 =====

function ScanPage(props: {
  scan: ScanResult | null;
  busy: string | null;
  onScan: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { scan } = props;
  const bookmarkCount = scan?.bookmarks.length ?? 0;
  const folderCount = scan?.folders.length ?? 0;
  const noTitleCount = scan?.bookmarks.filter(b => !b.title).length ?? 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>扫描书签</h1>
          <p>{scan ? '扫描完成，查看书签统计信息' : '正在读取你的书签树...'}</p>
        </div>
      </div>

      {!scan && (
        <div className="card">
          <button className="btn btn-primary btn-full" onClick={props.onScan} disabled={props.busy !== null}>
            {props.busy ? '正在扫描...' : '开始扫描'}
          </button>
        </div>
      )}

      {scan && (
        <>
          <div className="card scan-progress-card">
            <div className="scan-progress-header">
              <span>扫描完成</span>
              <span>100%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '100%' }} />
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value primary">{bookmarkCount}</div>
              <div className="stat-card-label">书签总数</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{folderCount}</div>
              <div className="stat-card-label">文件夹</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value primary">{bookmarkCount}</div>
              <div className="stat-card-label">可整理书签</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value muted">{noTitleCount}</div>
              <div className="stat-card-label">无标题</div>
            </div>
          </div>
        </>
      )}

      <div className="btn-row" style={{ marginTop: '16px' }}>
        <button className="btn btn-outline" onClick={props.onBack}>
          ← 上一步
        </button>
        {scan && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={props.onNext}>
            选择整理范围 →
          </button>
        )}
      </div>
    </div>
  );
}

// ===== 选择范围页 =====

interface FolderTreeNode {
  id: string;
  name: string;
  children: FolderTreeNode[];
  bookmarkIds: string[];
}

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M1 4a1 1 0 0 1 1-1h3.586L7 4.414A1 1 0 0 0 7.707 4.7L8 5H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" fill="#a5b4fc" stroke="#6366f1" strokeWidth="0.6" />
  </svg>
);

function buildFolderTree(scan: ScanResult): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();

  for (const root of scan.roots) {
    folderMap.set(root.id, { id: root.id, name: root.title, children: [], bookmarkIds: [] });
  }
  for (const folder of scan.folders) {
    folderMap.set(folder.id, { id: folder.id, name: folder.title, children: [], bookmarkIds: [] });
  }
  for (const folder of scan.folders) {
    const parent = folderMap.get(folder.parentId);
    const node = folderMap.get(folder.id)!;
    if (parent) parent.children.push(node);
  }
  for (const bm of scan.bookmarks) {
    const folder = folderMap.get(bm.parentId);
    if (folder) folder.bookmarkIds.push(bm.id);
  }

  // 剪枝：移除没有书签的空文件夹
  const prune = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
    return nodes
      .map(n => ({ ...n, children: prune(n.children) }))
      .filter(n => n.children.length > 0 || n.bookmarkIds.length > 0);
  };

  return prune(scan.roots.map(r => folderMap.get(r.id)!));
}

function collectAllBookmarkIds(node: FolderTreeNode): string[] {
  return [
    ...node.bookmarkIds,
    ...node.children.flatMap(collectAllBookmarkIds),
  ];
}

function buildFolderMap(nodes: FolderTreeNode[]): Map<string, FolderTreeNode> {
  const map = new Map<string, FolderTreeNode>();
  const walk = (list: FolderTreeNode[]) => {
    for (const n of list) {
      map.set(n.id, n);
      walk(n.children);
    }
  };
  walk(nodes);
  return map;
}

export function SelectPage(props: {
  scan: ScanResult;
  selectedIds: Set<string> | null;
  onSelect: (ids: Set<string> | null) => void;
  onBack: () => void;
  onGenerate: (mode: OrganizeMode) => void;
}) {
  const { scan, selectedIds } = props;
  const bookmarks = scan.bookmarks;
  const selectedCount = selectedIds
    ? bookmarks.filter((b) => selectedIds.has(b.id)).length
    : bookmarks.length;

  const tree = useMemo(() => buildFolderTree(scan), [scan]);
  const folderMap = useMemo(() => buildFolderMap(tree), [tree]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>('conservative');

  const collection = useMemo(() => createTreeCollection({
    rootNode: { id: 'root', name: 'Root', children: tree, bookmarkIds: [] },
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
  }), [tree]);

  // 默认展开所有分支节点
  const allBranchIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: FolderTreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.push(n.id);
          walk(n.children);
        }
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const bookmarksById = useMemo(() => {
    const map = new Map<string, ScannedBookmark>();
    for (const b of bookmarks) map.set(b.id, b);
    return map;
  }, [bookmarks]);

  const activeFolderNode = activeFolderId ? folderMap.get(activeFolderId) ?? null : null;

  const activeFolderBookmarks = useMemo(() => {
    if (!activeFolderNode) return [];
    return activeFolderNode.bookmarkIds
      .map(id => bookmarksById.get(id))
      .filter((b): b is ScannedBookmark => !!b);
  }, [activeFolderNode, bookmarksById]);

  const toggleBookmark = (id: string) => {
    const ids = new Set(selectedIds ?? bookmarks.map((b) => b.id));
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    props.onSelect(ids);
  };

  const toggleFolder = (node: FolderTreeNode) => {
    const bmIds = collectAllBookmarkIds(node);
    const ids = new Set(selectedIds ?? bookmarks.map((b) => b.id));
    const allSelected = bmIds.every(id => ids.has(id));
    if (allSelected) {
      for (const id of bmIds) ids.delete(id);
    } else {
      for (const id of bmIds) ids.add(id);
    }
    props.onSelect(ids);
  };

  const selectAllInFolder = () => {
    if (!activeFolderNode) return;
    const ids = new Set(selectedIds ?? bookmarks.map((b) => b.id));
    for (const id of activeFolderNode.bookmarkIds) ids.add(id);
    props.onSelect(ids);
  };

  const selectNoneInFolder = () => {
    if (!activeFolderNode) return;
    const ids = new Set(selectedIds ?? bookmarks.map((b) => b.id));
    for (const id of activeFolderNode.bookmarkIds) ids.delete(id);
    props.onSelect(ids);
  };

  // 计算叶子节点的选中状态
  const getLeafCheckState = (node: FolderTreeNode): 'all' | 'some' | 'none' => {
    const bmIds = collectAllBookmarkIds(node);
    if (bmIds.length === 0) return 'none';
    if (!selectedIds) return 'all';
    const count = bmIds.filter(id => selectedIds.has(id)).length;
    if (count === bmIds.length) return 'all';
    if (count > 0) return 'some';
    return 'none';
  };

  const getLeafCount = (node: FolderTreeNode): { selected: number; total: number } => {
    const bmIds = collectAllBookmarkIds(node);
    const selected = selectedIds ? bmIds.filter(id => selectedIds.has(id)).length : bmIds.length;
    return { selected, total: bmIds.length };
  };

  return (
    <div className="page-container wide">
      <div className="page-header">
        <div className="page-header-left">
          <h1>选择整理范围</h1>
          <p>点击文件夹查看书签，勾选要整理的内容</p>
        </div>
      </div>

      <div className="select-split">
        {/* 左栏：文件夹树 */}
        <div className="select-split-left">
          <div className="select-split-header">书签文件夹</div>
          <div className="select-folder-tree">
            <TreeView.Root
              collection={collection}
              defaultExpandedValue={allBranchIds}
              size="sm"
            >
              <TreeView.Tree>
                <TreeView.Node
                  render={({ node, nodeState }) => {
                    const folderNode = folderMap.get(node.id);
                    if (!folderNode) return null;
                    const isActive = activeFolderId === node.id;
                    const count = getLeafCount(folderNode);
                    const checkState = getLeafCheckState(folderNode);

                    if (nodeState.isBranch) {
                      return (
                        <TreeView.BranchControl
                          className={`folder-tree-row ${isActive ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFolderId(node.id);
                          }}
                        >
                          <TreeView.BranchIndicator className="folder-tree-arrow">
                            <span>▾</span>
                          </TreeView.BranchIndicator>
                          <FolderIcon />
                          <TreeView.BranchText className="folder-tree-name">
                            {node.name}
                          </TreeView.BranchText>
                          {count.total > 0 && (
                            <>
                              <span className="folder-tree-count">{count.selected}/{count.total}</span>
                              <input
                                type="checkbox"
                                className="folder-tree-checkbox"
                                checked={checkState !== 'none'}
                                ref={(el) => { if (el) el.indeterminate = checkState === 'some'; }}
                                onChange={(e) => { e.stopPropagation(); toggleFolder(folderNode); }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </>
                          )}
                        </TreeView.BranchControl>
                      );
                    }

                    return (
                      <TreeView.Item
                        className={`folder-tree-row folder-tree-leaf ${isActive ? 'active' : ''}`}
                        onClick={() => setActiveFolderId(node.id)}
                      >
                        <span className="folder-tree-arrow-spacer" />
                        <FolderIcon />
                        <TreeView.ItemText className="folder-tree-name">
                          {node.name}
                        </TreeView.ItemText>
                        {count.total > 0 && (
                          <>
                            <span className="folder-tree-count">{count.selected}/{count.total}</span>
                            <input
                              type="checkbox"
                              className="folder-tree-checkbox"
                              checked={checkState !== 'none'}
                              ref={(el) => { if (el) el.indeterminate = checkState === 'some'; }}
                              onChange={(e) => { e.stopPropagation(); toggleFolder(folderNode); }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </>
                        )}
                      </TreeView.Item>
                    );
                  }}
                />
              </TreeView.Tree>
            </TreeView.Root>
          </div>
        </div>

        {/* 右栏：书签列表 */}
        <div className="select-split-right">
          {activeFolderNode ? (
            <>
              <div className="select-split-header">
                <span className="select-right-title">
                  <FolderIcon />
                  {activeFolderNode.name}
                </span>
                <div className="select-actions">
                  <button onClick={selectAllInFolder}>全选</button>
                  <button onClick={selectNoneInFolder}>全不选</button>
                </div>
              </div>
              <div className="select-bookmark-list">
                {activeFolderBookmarks.map(b => (
                  <label key={b.id} className="select-bookmark-item">
                    <input
                      type="checkbox"
                      checked={!selectedIds || selectedIds.has(b.id)}
                      onChange={() => toggleBookmark(b.id)}
                    />
                    <img
                      className="select-bookmark-favicon"
                      src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(b.url)}&size=32`}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="select-bookmark-info">
                      <span className="select-bookmark-title">{b.title || b.url}</span>
                      <span className="select-bookmark-url">{b.url}</span>
                    </div>
                  </label>
                ))}
                {activeFolderBookmarks.length === 0 && (
                  <div className="select-empty">该文件夹下无书签</div>
                )}
              </div>
            </>
          ) : (
            <div className="select-empty-panel">
              <p>点击左侧文件夹查看书签</p>
            </div>
          )}
        </div>
      </div>

      <fieldset className="organize-mode-fieldset">
        <legend className="sr-only">选择整理模式</legend>
        <div className="organize-mode-grid">
          <label className={`organize-mode-card ${organizeMode === 'conservative' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="organize-mode"
              value="conservative"
              checked={organizeMode === 'conservative'}
              onChange={() => setOrganizeMode('conservative')}
            />
            <span className="organize-mode-icon" aria-hidden="true">☷</span>
            <span className="organize-mode-copy">
              <strong>保守整理</strong>
              <span>保留现有目录结构，仅将书签移入最合适的已有文件夹</span>
            </span>
            <span className="organize-mode-indicator" aria-hidden="true" />
          </label>

          <label className={`organize-mode-card ${organizeMode === 'reorganize' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="organize-mode"
              value="reorganize"
              checked={organizeMode === 'reorganize'}
              onChange={() => setOrganizeMode('reorganize')}
            />
            <span className="organize-mode-icon" aria-hidden="true">☷</span>
            <span className="organize-mode-copy">
              <strong>重新规划目录</strong>
              <span>AI 自由设计全新的目录体系，适合书签杂乱需要彻底整理的情况</span>
            </span>
            <span className="organize-mode-indicator" aria-hidden="true" />
          </label>
        </div>
      </fieldset>

      <div className="select-footer">
        <button className="btn btn-outline" onClick={props.onBack}>
          ← 返回
        </button>
        <span className="select-footer-count">
          已选 <strong>{selectedCount}</strong> 条书签
        </span>
        <button
          className="btn btn-primary"
          onClick={() => props.onGenerate(organizeMode)}
          disabled={selectedCount === 0}
        >
          AI 开始分析 ({selectedCount} 条) →
        </button>
      </div>
    </div>
  );
}

// ===== AI 分析中页 =====

interface AnalysisStep {
  title: string;
  description: string;
}

const ANALYSIS_STEPS: AnalysisStep[] = [
  { title: '读取书签数据...', description: '仅读取标题、URL 和当前目录，不访问网页' },
  { title: '发送至 AI 模型...', description: '使用你自己的 API Key，请求直达服务商' },
  { title: '解析 AI 建议...', description: '解析结构化 JSON 输出' },
  { title: '验证目录结构...', description: '本地校验路径合法性和层级深度（最多两级）' },
  { title: '生成预览...', description: '整理建议已准备好，等待你确认' },
];

function OrganizingPage(props: {
  progress: GeneratePlanProgress | null;
  settings: ModelSettings | null;
  onBack: () => void;
}) {
  const { progress } = props;

  // 根据 progress 推断当前步骤
  let currentStep = 0;
  if (progress) {
    if (progress.phase === 'taxonomy') {
      currentStep = progress.processed > 0 ? 2 : 1;
    } else {
      // assign 阶段
      currentStep = progress.processed === progress.total ? 4 : 3;
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>AI 正在分析</h1>
          <p>根据标题、URL 和当前目录生成分类建议</p>
        </div>
      </div>

      <div className="step-list">
        {ANALYSIS_STEPS.map((step, i) => {
          let status: 'done' | 'active' | 'pending' = 'pending';
          if (i < currentStep) status = 'done';
          else if (i === currentStep) status = 'active';

          return (
            <div key={i} className={`step-card ${status}`}>
              <div className={`step-icon ${status}`}>
                {status === 'done' ? '✓' : status === 'active' ? '⟳' : (i + 1)}
              </div>
              <div className="step-card-content">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {progress && (
        <div className="card">
          <div className="progress-label">
            <span>{progress.phase === 'taxonomy' ? '生成目录体系' : '分配书签'}</span>
            <span>{progress.processed}/{progress.total}</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="privacy-card">
        <strong>隐私说明</strong>
        本次整理仅向 AI 发送书签标题和 URL，不读取网页正文，不记录日志，不上传至本扩展服务器。所有操作在你的浏览器本地执行。
      </div>

      <div className="btn-row" style={{ marginTop: '16px' }}>
        <button className="btn btn-outline" onClick={props.onBack}>
          ← 上一步
        </button>
      </div>
    </div>
  );
}

// ===== 预览页 =====

function PreviewPage(props: {
  assignments: Assignment[];
  taxonomy: string[][];
  bookmarksById: Map<string, ScannedBookmark>;
  onChange: (assignments: Assignment[]) => void;
  onBack: () => void;
  onApply: () => void;
}) {
  const { assignments, taxonomy, bookmarksById } = props;
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // 构建树结构
  const tree = useMemo(() => {
    type TreeNode = {
      name: string;
      isNew: boolean;
      children: TreeNode[];
      bookmarks: { id: string; title: string; url: string; excluded: boolean }[];
    };
    const root: TreeNode[] = [];

    // 收集所有目标路径
    const existingFolders = new Set(taxonomy.flat());
    const grouped = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = a.targetPath.join('/');
      const group = grouped.get(key);
      if (group) group.push(a);
      else grouped.set(key, [a]);
    }

    for (const [pathStr, items] of grouped) {
      const parts = pathStr.split('/');
      let nodes = root;
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] ?? '';
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let node = nodes.find(n => n.name === part);
        if (!node) {
          node = {
            name: part,
            isNew: !existingFolders.has(part),
            children: [],
            bookmarks: [],
          };
          nodes.push(node);
        }
        if (i === parts.length - 1) {
          for (const a of items) {
            const b = bookmarksById.get(a.bookmarkId);
            node.bookmarks.push({
              id: a.bookmarkId,
              title: b?.title || b?.url || a.bookmarkId,
              url: b?.url || '',
              excluded: excludedIds.has(a.bookmarkId),
            });
          }
        }
        nodes = node.children;
      }
    }
    return root;
  }, [assignments, taxonomy, bookmarksById, excludedIds]);

  const toggleExclude = (bookmarkId: string) => {
    const next = new Set(excludedIds);
    if (next.has(bookmarkId)) next.delete(bookmarkId);
    else next.add(bookmarkId);
    setExcludedIds(next);
    // 更新 assignments：排除的书签从列表移除
    props.onChange(assignments.filter(a => !next.has(a.bookmarkId)));
  };

  const activeCount = assignments.length - excludedIds.size;
  // 统计新建目录数
  const newFolderCount = useMemo(() => {
    const existingFolders = new Set(taxonomy.flat());
    const newFolders = new Set<string>();
    for (const a of assignments) {
      for (const part of a.targetPath) {
        if (!existingFolders.has(part)) newFolders.add(part);
      }
    }
    return newFolders.size;
  }, [assignments, taxonomy]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>预览整理建议</h1>
          <p>点击书签可排除或恢复。文件夹标注「新」表示将新建该目录。</p>
        </div>
        <div className="page-stats">
          <div>
            <div className="page-stat-value">{activeCount}</div>
            <div className="page-stat-label">将移动</div>
          </div>
          <div>
            <div className="page-stat-value">{newFolderCount}</div>
            <div className="page-stat-label">新建目录</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>整理后的书签目录树</span>
          <span>点击书签行可排除</span>
        </div>
        <div className="tree-view">
          {tree.map(node => (
            <TreeFolder key={node.name} node={node} onToggle={toggleExclude} />
          ))}
        </div>
      </div>

      <div className="btn-row-spread">
        <button className="btn btn-outline" onClick={props.onBack}>返回</button>
        <div className="btn-row">
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            应用前将保存本地快照，可一键撤销
          </span>
          <button className="btn btn-primary" onClick={() => void props.onApply()}>
            一键应用 ({activeCount} 条) →
          </button>
        </div>
      </div>
    </div>
  );
}

// 树节点组件
function TreeFolder({ node, onToggle, depth = 0 }: {
  node: { name: string; isNew: boolean; children: any[]; bookmarks: any[] };
  onToggle: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalBookmarks = countBookmarks(node);

  return (
    <div className="tree-folder">
      <div className="tree-folder-header" onClick={() => setExpanded(!expanded)}>
        <span className={`tree-folder-arrow ${!expanded ? 'collapsed' : ''}`}>▾</span>
        <FolderIcon />
        <span className="tree-folder-name">{node.name}</span>
        {node.isNew && <span className="tree-folder-badge">新</span>}
        <span className="tree-folder-count">{totalBookmarks}/{totalBookmarks}</span>
      </div>
      {expanded && (
        <div className="tree-folder-children">
          {node.children.map((child: any) => (
            <TreeFolder key={child.name} node={child} onToggle={onToggle} depth={depth + 1} />
          ))}
          {node.bookmarks.map((b: any) => (
            <div
              key={b.id}
              className={`tree-bookmark ${b.excluded ? 'excluded' : ''}`}
              onClick={() => onToggle(b.id)}
            >
              <img
                className="tree-bookmark-favicon"
                src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(b.url)}&size=16`}
                alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="tree-bookmark-title">{b.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function countBookmarks(node: any): number {
  let count = node.bookmarks.filter((b: any) => !b.excluded).length;
  for (const child of node.children) count += countBookmarks(child);
  return count;
}

// ===== 执行结果页 =====

function ResultPage(props: {
  job: JobState;
  totalAssignments: number;
  busy: string | null;
  onRetry: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onNewRound: () => void;
}) {
  const { job, totalAssignments } = props;
  const applied = job.appliedIds.length;
  const failures: FailureItem[] = job.failures;
  const pending = totalAssignments - applied - failures.length;
  const percent = totalAssignments > 0 ? Math.round((applied / totalAssignments) * 100) : 0;

  const isApplying = job.status === 'applying' || job.status === 'undoing';
  const isDone = job.status === 'completed' || job.status === 'undone' || job.status === 'partially_undone';

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          {isApplying && (
            <>
              <h1>正在写入书签</h1>
              <p>逐条移动，不会删除任何现有书签</p>
            </>
          )}
          {job.status === 'completed' && (
            <>
              <h1>整理完成</h1>
              <p>成功移动 {applied} 条书签到新目录</p>
            </>
          )}
          {job.status === 'undone' && (
            <>
              <h1>已撤销</h1>
              <p>已撤销最近一次整理，书签已还原</p>
            </>
          )}
          {job.status === 'interrupted' && (
            <>
              <h1>已中断</h1>
              <p>可以从断点继续应用，或撤销已应用的部分</p>
            </>
          )}
          {job.status === 'failed' && (
            <>
              <h1>应用失败</h1>
              <p>可重试或撤销</p>
            </>
          )}
          {job.status === 'partially_undone' && (
            <>
              <h1>部分撤销</h1>
              <p>部分撤销成功，存在冲突项，可再次尝试</p>
            </>
          )}
        </div>
      </div>

      {/* 进度条（写入中显示） */}
      {(isApplying || job.status === 'interrupted') && (
        <div className="card">
          <div className="progress-label">
            <span>{applied} / {totalAssignments} 完成</span>
            <span>{percent}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="stat-grid stat-grid-3">
        <div className="stat-card">
          <div className="stat-card-value success">{applied}</div>
          <div className="stat-card-label">已完成</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{Math.max(0, pending)}</div>
          <div className="stat-card-label">待处理</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value muted">{failures.length}</div>
          <div className="stat-card-label">失败</div>
        </div>
      </div>

      {/* 信息提示 */}
      {isApplying && (
        <div className="banner banner-info">
          已保存恢复快照。完成后可在结果页一键撤销本次整理，还原所有书签至原始位置。
        </div>
      )}

      {/* 失败详情 */}
      {failures.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span>失败详情 ({failures.length})</span>
          </div>
          {failures.map((f, i) => (
            <div key={f.bookmarkId ?? i} className="banner banner-error" style={{ marginBottom: '8px' }}>
              {f.bookmarkId ? `${f.bookmarkId}：` : ''}{f.message}
            </div>
          ))}
        </div>
      )}

      {/* 错误信息 */}
      {job.error && <div className="banner banner-error">{job.error.message}</div>}

      {/* 操作按钮 */}
      <div className="btn-row" style={{ marginTop: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {isApplying && (
          <button className="btn btn-outline" onClick={props.onCancel} disabled={props.busy !== null}>
            中断
          </button>
        )}
        {(job.status === 'failed' || job.status === 'interrupted') && (
          <button className="btn btn-primary" onClick={props.onRetry} disabled={props.busy !== null}>
            从断点继续
          </button>
        )}
        {isDone && applied > 0 && (
          <button className="btn btn-outline" onClick={props.onUndo} disabled={props.busy !== null}>
            撤销本次整理
          </button>
        )}
        {!isApplying && (
          <button className="btn btn-primary" onClick={props.onNewRound} disabled={props.busy !== null}>
            开始新一轮整理
          </button>
        )}
      </div>
    </div>
  );
}
