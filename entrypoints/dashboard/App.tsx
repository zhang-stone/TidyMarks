import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  type FolderNameStyle,
  type JobState,
  type ModelSettings,
  type OrganizeMode,
  type PlanRecord,
  type ScanFolder,
  type ScanResult,
  type ScannedBookmark,
} from '@/src/shared/schemas';
import { classifyError } from '@/src/shared/errors';
import { findDuplicateGroups, type DuplicateGroup, type DuplicateKind } from '@/src/domain/bookmarks/duplicates';
import { findEmptyFolders } from '@/src/domain/bookmarks/emptyFolders';

const SelectFolderTree = lazy(() => import('./SelectFolderTree'));

// ===== 类型定义 =====

type View = 'settings' | 'scan' | 'duplicates' | 'emptyFolders' | 'select' | 'organizing' | 'preview' | 'result';

interface AppState {
  view: View;
  settings: ModelSettings | null;
  job: JobState | null;
  scan: ScanResult | null;
  plan: PlanRecord | null;
  progress: GeneratePlanProgress | null;
  busy: string | null;
  error: string | null;
}

type Action =
  | { type: 'init'; settings: ModelSettings | null; status: ResumeView }
  | { type: 'view'; view: View }
  | { type: 'settingsSaved'; settings: ModelSettings; view: View }
  | { type: 'scanDone'; scan: ScanResult; job: JobState }
  | { type: 'scanRefreshed'; scan: ScanResult }
  | { type: 'planProgress'; progress: GeneratePlanProgress }
  | { type: 'planDone'; plan: PlanRecord }
  | { type: 'jobUpdate'; job: JobState | null }
  | { type: 'resetForNewRound' }
  | { type: 'busy'; busy: string | null }
  | { type: 'error'; error: string | null };

const initialState: AppState = {
  view: 'scan',
  settings: null,
  job: null,
  scan: null,
  plan: null,
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
  return 'scan';
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
        view: viewForStatus(action.status),
      };
    case 'view':
      return { ...state, view: action.view, error: null, progress: null };
    case 'settingsSaved':
      return { ...state, settings: action.settings, view: action.view, error: null };
    case 'scanDone':
      return { ...state, scan: action.scan, job: action.job, view: 'scan' };
    case 'scanRefreshed':
      return { ...state, scan: action.scan, view: 'scan' };
    case 'planProgress':
      return { ...state, progress: action.progress };
    case 'planDone':
      return {
        ...state,
        plan: action.plan,
        view: 'preview',
        progress: null,
      };
    case 'jobUpdate':
      return { ...state, job: action.job };
    case 'resetForNewRound':
      // 开始新一轮整理：清空上一轮的扫描/方案/任务，回到扫描页并触发重新扫描
      return {
        ...state,
        scan: null,
        plan: null,
        job: null,
        progress: null,
        error: null,
        view: 'scan',
      };
    case 'busy':
      return { ...state, busy: action.busy, error: action.busy ? null : state.error };
    case 'error':
      return { ...state, error: action.error, busy: null };
  }
}

// ===== 步骤配置 =====

const STEPS = [
  { key: 'scan', label: '扫描', num: 1 },
  { key: 'select', label: '选择', num: 2 },
  { key: 'organizing', label: '整理', num: 3 },
  { key: 'preview', label: '预览', num: 4 },
  { key: 'result', label: '完成', num: 5 },
] as const;

function getActiveStep(view: View, jobStatus?: string): number {
  switch (view) {
    case 'settings': return 0;
    case 'scan': return 1;
    case 'duplicates': return 1;
    case 'emptyFolders': return 1;
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

// ===== 根组件 =====

const storage = createStorageRepository(chrome.storage.local);

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string> | null>(null);
  const jobIdRef = useRef<string>(crypto.randomUUID());
  const settingsReturnViewRef = useRef<View>('scan');
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
        if (status.plan) {
          setSelectedFolderIds(new Set(status.plan.selectedFolderIds));
        }
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
      // 忽略非当前任务的广播，避免上一轮撤销/应用的延迟事件顶掉新一轮界面
      if (data.job.jobId !== jobIdRef.current) return;
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

  // 执行一次书签扫描，成功后更新界面
  const runScan = useCallback(async (): Promise<void> => {
    jobIdRef.current = crypto.randomUUID();
    const payload = (await runCommand(
      { type: 'SCAN_BOOKMARKS', requestId: crypto.randomUUID(), jobId: jobIdRef.current },
      '正在扫描书签',
    )) as { scan: ScanResult; job: JobState } | null;
    if (payload) {
      setSelectedFolderIds(null);
      dispatch({ type: 'scanDone', scan: payload.scan, job: payload.job });
    }
  }, [runCommand]);

  const bookmarksById = useMemo(() => {
    const map = new Map<string, ScannedBookmark>();
    for (const b of state.scan?.bookmarks ?? []) map.set(b.id, b);
    return map;
  }, [state.scan]);

  const selectedBookmarks = useMemo(
    () => state.scan ? bookmarksInSelectedFolders(state.scan, selectedFolderIds) : [],
    [state.scan, selectedFolderIds],
  );
  const duplicateGroups = useMemo(
    () => findDuplicateGroups(state.scan?.bookmarks ?? []),
    [state.scan],
  );
  const emptyFolders = useMemo(
    () => (state.scan ? findEmptyFolders(state.scan) : []),
    [state.scan],
  );
  const rootTitleById = useMemo(
    () => new Map((state.scan?.roots ?? []).map((root) => [root.id, root.title])),
    [state.scan],
  );

  const activeStep = getActiveStep(state.view, state.job?.status);
  const openSettings = () => {
    if (state.view !== 'settings') settingsReturnViewRef.current = state.view;
    dispatch({ type: 'view', view: 'settings' });
  };
  const closeSettings = () => {
    dispatch({ type: 'view', view: settingsReturnViewRef.current });
  };

  return (
    <>
      {state.view !== 'duplicates' && state.view !== 'emptyFolders' && (
        <AppHeader
          activeStep={activeStep}
          settingsOpen={state.view === 'settings'}
          onOpenSettings={openSettings}
          onCloseSettings={closeSettings}
        />
      )}
      {state.error && <div className="page-container"><div className="banner banner-error">{state.error}</div></div>}

      {state.view === 'settings' && (
        <SettingsPage
          initial={state.settings}
          onSaved={(settings) =>
            dispatch({ type: 'settingsSaved', settings, view: settingsReturnViewRef.current })
          }
          onCancel={closeSettings}
          onError={(message) => dispatch({ type: 'error', error: message })}
        />
      )}

      {state.view === 'scan' && (
        <ScanPage
          scan={state.scan}
          busy={state.busy}
          onScan={() => void runScan()}
          onNext={() => dispatch({ type: 'view', view: 'select' })}
          duplicateCount={duplicateGroups.length}
          onDuplicates={() => dispatch({ type: 'view', view: 'duplicates' })}
          emptyFolderCount={emptyFolders.length}
          onEmptyFolders={() => dispatch({ type: 'view', view: 'emptyFolders' })}
        />
      )}

      {state.view === 'emptyFolders' && state.scan && (
        <EmptyFoldersPage
          folders={emptyFolders}
          rootTitleById={rootTitleById}
          busy={state.busy}
          onBack={() => dispatch({ type: 'view', view: 'scan' })}
          onDelete={async (folderIds) => {
            const payload = (await runCommand(
              {
                type: 'DELETE_EMPTY_FOLDERS',
                requestId: crypto.randomUUID(),
                folderIds,
              },
              '正在删除空文件夹',
            )) as { scan: ScanResult; deletedIds: string[]; failures: Array<{ message: string }> } | null;
            if (!payload) return;
            dispatch({ type: 'scanRefreshed', scan: payload.scan });
            if (payload.failures.length) {
              dispatch({ type: 'error', error: `${payload.deletedIds.length} 个已删除，${payload.failures.length} 个删除失败` });
            }
          }}
        />
      )}

      {state.view === 'duplicates' && state.scan && (
        <DuplicateBookmarksPage
          groups={duplicateGroups}
          busy={state.busy}
          onBack={() => dispatch({ type: 'view', view: 'scan' })}
          onDelete={async (bookmarkIds) => {
            const payload = (await runCommand(
              {
                type: 'DELETE_DUPLICATE_BOOKMARKS',
                requestId: crypto.randomUUID(),
                bookmarkIds,
              },
              '正在删除重复书签',
            )) as { scan: ScanResult; deletedIds: string[]; failures: Array<{ message: string }> } | null;
            if (!payload) return;
            dispatch({ type: 'scanRefreshed', scan: payload.scan });
            if (payload.failures.length) {
              dispatch({ type: 'error', error: `${payload.deletedIds.length} 条已删除，${payload.failures.length} 条删除失败` });
            }
          }}
        />
      )}

      {state.view === 'select' && state.scan && (
        <SelectPage
          scan={state.scan}
          selectedFolderIds={selectedFolderIds}
          onSelectFolders={setSelectedFolderIds}
          onBack={() => dispatch({ type: 'view', view: 'scan' })}
          onGenerate={async (mode, folderNameStyle) => {
            if (!state.settings) {
              settingsReturnViewRef.current = 'select';
              dispatch({ type: 'view', view: 'settings' });
              dispatch({ type: 'error', error: '请先完成模型设置' });
              return;
            }
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
                  folderNameStyle,
                  selectedFolderIds: [
                    ...(selectedFolderIds ?? new Set([
                      ...(state.scan?.roots ?? []).map((root) => root.id),
                      ...(state.scan?.folders ?? []).map((folder) => folder.id),
                    ])),
                  ],
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
          assignments={state.plan.assignments}
          scan={state.scan}
          selectedFolderCount={state.plan.selectedFolderIds.length}
          bookmarksById={bookmarksById}
          onBack={() => dispatch({ type: 'view', view: 'select' })}
          onApply={async () => {
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
          totalAssignments={state.plan?.assignments.length ?? 0}
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
            setSelectedFolderIds(null);
            // 清除持久化 job 与撤销快照，重置内存状态后回到扫描页并重新扫描书签
            void storage.clear(['plan', 'scan', 'job', 'undo']);
            dispatch({ type: 'resetForNewRound' });
            void runScan();
          }}
        />
      )}
    </>
  );
}

// ===== 顶部导航栏 =====

function AppHeader(props: {
  activeStep: number;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}) {
  return (
    <header className={`app-header ${props.settingsOpen ? 'settings-open' : ''}`}>
      <div className="app-header-inner">
      <div className="app-logo">
        <div className="app-logo-icon">
          <svg viewBox="0 0 200 200">
            <path d="M58 24H126C134 24 140 30 140 38V168L92 139L44 168V38C44 30 50 24 58 24Z" fill="none" strokeWidth={12} strokeLinejoin="round" />
            <path d="M64 87L84 108L122 66" fill="none" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M156 25L160 39L174 43L160 47L156 61L152 47L138 43L152 39Z" fill="#fff" stroke="none" />
          </svg>
        </div>
        <span>TidyMarks</span>
      </div>

      {props.settingsOpen ? (
        <div className="settings-header-title">模型设置</div>
      ) : (
        <div className="step-indicator">
          {STEPS.map((step, i) => (
            <span key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div className="step-item">
                <div
                  className={`step-circle ${
                    step.num < props.activeStep ? 'completed' :
                    step.num === props.activeStep ? 'active' : ''
                  }`}
                >
                  {step.num < props.activeStep ? '✓' : step.num}
                </div>
                <span className={`step-label ${step.num === props.activeStep ? 'active' : ''}`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-connector ${step.num < props.activeStep ? 'completed' : ''}`} />
              )}
            </span>
          ))}
        </div>
      )}

      <button
        className={`header-settings-btn ${props.settingsOpen ? 'active' : ''}`}
        onClick={props.settingsOpen ? props.onCloseSettings : props.onOpenSettings}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {props.settingsOpen ? '关闭设置' : '设置'}
      </button>
      </div>
    </header>
  );
}

// ===== 模型配置页 =====

function SettingsPage(props: {
  initial: ModelSettings | null;
  onSaved: (settings: ModelSettings) => void;
  onCancel: () => void;
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
    <div className="settings-page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>模型设置</h1>
          <p>使用你自己的 API Key，Key 仅保存在本地，不经过本扩展服务器</p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-field-row">
          <label className="field-label">API BASE URL</label>
          <input
            className="field-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <div className="field-helper">兼容 OpenAI-compatible 接口，支持 DeepSeek、本地 Ollama 等</div>
        </div>
        <div className="settings-field-row">
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
        <div className="settings-field-row">
          <label className="field-label">MODEL</label>
          <input
            className="field-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>
      </div>

      {testResult === 'success' && (
        <div className="banner banner-success">{testMessage}</div>
      )}
      {testResult === 'error' && (
        <div className="banner banner-error">{testMessage}</div>
      )}

      <div className="settings-actions">
        <button className="btn btn-outline" onClick={() => void testConnection()} disabled={testing}>
          {testing ? '测试中...' : '测试连接'}
        </button>
        <div className="btn-row">
          <button className="btn btn-outline" onClick={props.onCancel}>取消</button>
          <button className="btn btn-primary" onClick={() => void save()}>保存</button>
        </div>
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
  duplicateCount: number;
  onDuplicates: () => void;
  emptyFolderCount: number;
  onEmptyFolders: () => void;
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
            <div className="stat-grid scan-stat-grid">
              <div className="stat-card">
                <div className="stat-card-value">{bookmarkCount}</div>
                <div className="stat-card-label">书签总数</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{folderCount}</div>
                <div className="stat-card-label">文件夹</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{bookmarkCount}</div>
                <div className="stat-card-label">可整理书签</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{noTitleCount}</div>
                <div className="stat-card-label">无标题</div>
              </div>
            </div>
          </div>

          <div className="scan-feature-label">选择功能</div>
          <div className="scan-feature-grid">
            <button className="scan-feature-card" onClick={props.onNext}>
              <span className="scan-feature-icon scan-feature-icon-primary">▦</span>
              <strong>整理书签</strong>
              <span>AI 自动分类，重建目录结构</span>
              <b>选择范围 →</b>
            </button>
            <button className="scan-feature-card" onClick={props.onDuplicates} disabled={!props.duplicateCount}>
              <span className="scan-feature-icon">▣</span>
              <strong>检查重复书签</strong>
              <span>找出相同或相似的重复项</span>
              <b>{props.duplicateCount ? `查看 ${props.duplicateCount} 组结果 →` : '未发现重复项'}</b>
            </button>
            <button className="scan-feature-card" onClick={props.onEmptyFolders} disabled={!props.emptyFolderCount}>
              <span className="scan-feature-icon">🗑</span>
              <strong>清理空文件夹</strong>
              <span>删除不含任何书签的空目录</span>
              <b>{props.emptyFolderCount ? `发现 ${props.emptyFolderCount} 个空文件夹 →` : '没有空文件夹'}</b>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const DUPLICATE_LABELS: Record<DuplicateKind, string> = {
  'same-url': '相同网址',
  'similar-url': '相似网址',
  'same-title': '相同标题',
};

function formatBookmarkDate(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(value)
    .replaceAll('/', '-');
}

function DuplicateBookmarksPage(props: {
  groups: DuplicateGroup[];
  busy: string | null;
  onBack: () => void;
  onDelete: (bookmarkIds: string[]) => void;
}) {
  const [keptByGroup, setKeptByGroup] = useState<Record<string, string>>(
    () => Object.fromEntries(props.groups.map((group) => [group.id, group.bookmarks[0]!.id])),
  );
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());

  const deleteIds = props.groups.flatMap((group) =>
    ignored.has(group.id)
      ? []
      : group.bookmarks.filter((bookmark) => bookmark.id !== keptByGroup[group.id]).map((bookmark) => bookmark.id),
  );

  const toggleIgnored = (groupId: string) => {
    setIgnored((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <main className="duplicate-page">
      <div className="duplicate-topbar">
        <button className="duplicate-back" onClick={props.onBack}>‹&nbsp; 返回</button>
        <span>共发现 {props.groups.reduce((total, group) => total + group.bookmarks.length - 1, 0)} 个重复</span>
      </div>
      <div className="page-header duplicate-heading">
        <div className="page-header-left">
          <h1>重复书签</h1>
          <p>以下书签存在重复或高度相似，选择保留哪一个后可一键删除其余。</p>
        </div>
      </div>

      {props.groups.length === 0 && <div className="duplicate-empty">没有发现重复书签</div>}

      <div className="duplicate-groups">
        {props.groups.map((group) => {
          const isIgnored = ignored.has(group.id);
          return (
            <section className={`duplicate-group ${isIgnored ? 'ignored' : ''}`} key={group.id}>
              <header>
                <div>
                  <span className={`duplicate-badge ${group.kind}`}>{DUPLICATE_LABELS[group.kind]}</span>
                  <span>{group.bookmarks.length} 条</span>
                </div>
                <button onClick={() => toggleIgnored(group.id)}>{isIgnored ? '恢复' : '忽略'}</button>
              </header>
              {group.bookmarks.map((bookmark) => {
                const checked = keptByGroup[group.id] === bookmark.id;
                return (
                  <label className={`duplicate-item ${checked ? 'kept' : ''}`} key={bookmark.id}>
                    <img
                      src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=32`}
                      alt=""
                    />
                    <span className="duplicate-copy">
                      <strong>{bookmark.title || '无标题'}</strong>
                      <span>{bookmark.url}</span>
                      <small>
                        <em>{bookmark.path.join(' / ') || '未整理'}</em>
                        {formatBookmarkDate(bookmark.dateAdded)}
                      </small>
                    </span>
                    <input
                      type="radio"
                      name={group.id}
                      checked={checked}
                      disabled={isIgnored}
                      onChange={() => setKeptByGroup((current) => ({ ...current, [group.id]: bookmark.id }))}
                      aria-label={`保留 ${bookmark.title || bookmark.url}`}
                    />
                  </label>
                );
              })}
            </section>
          );
        })}
      </div>

      {props.groups.length > 0 && (
        <footer className="duplicate-footer">
          <span>将删除 <strong>{deleteIds.length}</strong> 个重复书签</span>
          <button
            className="btn duplicate-delete-btn"
            disabled={!deleteIds.length || props.busy !== null}
            onClick={() => props.onDelete(deleteIds)}
          >
            {props.busy ? '正在删除...' : '删除重复项'}
          </button>
        </footer>
      )}
    </main>
  );
}

// ===== 清理空文件夹页 =====

function EmptyFoldersPage(props: {
  folders: ScanFolder[];
  rootTitleById: Map<string, string>;
  busy: string | null;
  onBack: () => void;
  onDelete: (folderIds: string[]) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(props.folders.map((folder) => folder.id)),
  );

  const selectedIds = props.folders
    .filter((folder) => checked.has(folder.id))
    .map((folder) => folder.id);

  const toggle = (folderId: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // 列表按目录树顺序展示（深层在前删除更快，但阅读时按路径排序更直观）
  const displayFolders = useMemo(
    () => [...props.folders].sort((a, b) => {
      const pathA = [props.rootTitleById.get(a.rootId) ?? '', ...a.path].join(' / ');
      const pathB = [props.rootTitleById.get(b.rootId) ?? '', ...b.path].join(' / ');
      return pathA.localeCompare(pathB, 'zh-CN');
    }),
    [props.folders, props.rootTitleById],
  );

  return (
    <main className="duplicate-page">
      <div className="duplicate-topbar">
        <button className="duplicate-back" onClick={props.onBack}>‹&nbsp; 返回</button>
        <span>共发现 {props.folders.length} 个空文件夹</span>
      </div>
      <div className="page-header duplicate-heading">
        <div className="page-header-left">
          <h1>清理空文件夹</h1>
          <p>以下文件夹内没有任何书签，勾选后可一键删除；删除父文件夹会同时移除其中的空子目录。</p>
        </div>
      </div>

      {props.folders.length === 0 && <div className="duplicate-empty">没有空文件夹</div>}

      <div className="empty-folder-list">
        {displayFolders.map((folder) => (
          <label className="empty-folder-item" key={folder.id}>
            <span className="empty-folder-icon"><FolderIcon /></span>
            <span className="empty-folder-copy">
              <strong>{folder.path[folder.path.length - 1] ?? folder.title}</strong>
              <small>{[props.rootTitleById.get(folder.rootId) ?? '', ...folder.path].join(' / ')}</small>
            </span>
            <input
              type="checkbox"
              checked={checked.has(folder.id)}
              onChange={() => toggle(folder.id)}
              aria-label={`删除 ${folder.path.join(' / ')}`}
            />
          </label>
        ))}
      </div>

      {props.folders.length > 0 && (
        <footer className="duplicate-footer">
          <span>将删除 <strong>{selectedIds.length}</strong> 个空文件夹</span>
          <button
            className="btn duplicate-delete-btn"
            disabled={!selectedIds.length || props.busy !== null}
            onClick={() => props.onDelete(selectedIds)}
          >
            {props.busy ? '正在删除...' : '删除空文件夹'}
          </button>
        </footer>
      )}
    </main>
  );
}

// ===== 选择范围页 =====

export interface FolderTreeNode {
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

export function buildFolderTree(scan: ScanResult): FolderTreeNode[] {
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

  return scan.roots.map(r => folderMap.get(r.id)!);
}

export function collectAllFolderIds(node: FolderTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectAllFolderIds)];
}

export function bookmarksInSelectedFolders(
  scan: ScanResult,
  selectedFolderIds: Set<string> | null,
): ScannedBookmark[] {
  return scan.bookmarks.filter(
    (bookmark) => !selectedFolderIds || selectedFolderIds.has(bookmark.parentId),
  );
}

export function toggleFolderSelection(
  selectedFolderIds: Set<string> | null,
  allFolderIds: string[],
  node: FolderTreeNode,
): Set<string> {
  const subtreeIds = collectAllFolderIds(node);
  const next = new Set(selectedFolderIds ?? allFolderIds);
  const allSelected = subtreeIds.every((id) => next.has(id));
  for (const id of subtreeIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
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
  selectedFolderIds: Set<string> | null;
  onSelectFolders: (ids: Set<string> | null) => void;
  onBack: () => void;
  onGenerate: (mode: OrganizeMode, folderNameStyle: FolderNameStyle) => void;
}) {
  const { scan, selectedFolderIds } = props;
  const bookmarks = scan.bookmarks;
  const selectedCount = bookmarksInSelectedFolders(scan, selectedFolderIds).length;

  const tree = useMemo(() => buildFolderTree(scan), [scan]);
  const folderMap = useMemo(() => buildFolderMap(tree), [tree]);
  const allFolderIds = useMemo(
    () => tree.flatMap(collectAllFolderIds),
    [tree],
  );
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>('conservative');
  const [folderNameStyle, setFolderNameStyle] = useState<FolderNameStyle>('emoji');

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

  const toggleFolder = (node: FolderTreeNode) => {
    props.onSelectFolders(toggleFolderSelection(selectedFolderIds, allFolderIds, node));
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
            <Suspense fallback={<div className="select-empty">正在加载文件夹树...</div>}>
              <SelectFolderTree
                tree={tree}
                folderMap={folderMap}
                activeFolderId={activeFolderId}
                selectedFolderIds={selectedFolderIds}
                onActiveFolderChange={setActiveFolderId}
                onToggleFolder={toggleFolder}
              />
            </Suspense>
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
                <span className="select-bookmark-readonly">书签仅供查看</span>
              </div>
              <div className="select-bookmark-list">
                {activeFolderBookmarks.map(b => (
                  <div key={b.id} className="select-bookmark-item">
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
                  </div>
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

      <fieldset className="folder-name-style-fieldset">
        <legend className="sr-only">文件夹命名风格</legend>
        <div className="folder-name-style-title">
          <FolderIcon />
          文件夹命名风格
        </div>
        <div className="folder-name-style-grid">
          <label className={`folder-name-style-option ${folderNameStyle === 'emoji' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="folder-name-style"
              value="emoji"
              checked={folderNameStyle === 'emoji'}
              onChange={() => setFolderNameStyle('emoji')}
            />
            <span className="folder-name-style-copy">
              <strong>图标 + 文字</strong>
              <span className="folder-name-style-example">💻 开发工具</span>
              <small>用 emoji 前缀区分目录，一眼辨认</small>
            </span>
            <span className="organize-mode-indicator" aria-hidden="true" />
          </label>
          <label className={`folder-name-style-option ${folderNameStyle === 'text' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="folder-name-style"
              value="text"
              checked={folderNameStyle === 'text'}
              onChange={() => setFolderNameStyle('text')}
            />
            <span className="folder-name-style-copy">
              <strong>纯文字</strong>
              <span className="folder-name-style-example">开发工具</span>
              <small>保持简洁，不添加 emoji</small>
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
          已选 <strong>{selectedFolderIds?.size ?? allFolderIds.length}</strong> 个文件夹，
          共 <strong>{selectedCount}</strong> 条书签
        </span>
        <button
          className="btn btn-primary"
          onClick={() => props.onGenerate(organizeMode, folderNameStyle)}
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

export function PreviewPage(props: {
  assignments: Assignment[];
  scan: ScanResult | null;
  selectedFolderCount: number;
  bookmarksById: Map<string, ScannedBookmark>;
  onBack: () => void;
  onApply: () => void;
}) {
  const { assignments, bookmarksById } = props;
  type PreviewTreeNode = {
    name: string;
    isNew: boolean;
    children: PreviewTreeNode[];
    bookmarks: { id: string; title: string; url: string }[];
  };
  const pathKey = (rootId: string, path: string[]): string => JSON.stringify([rootId, ...path]);
  const existingFolderPaths = useMemo(
    () => new Set((props.scan?.folders ?? []).map((folder) => pathKey(folder.rootId, folder.path))),
    [props.scan],
  );

  // 构建树结构
  const tree = useMemo(() => {
    const root: PreviewTreeNode[] = [];
    const grouped = new Map<string, { path: string[]; items: Assignment[] }>();
    for (const assignment of assignments) {
      const key = JSON.stringify(assignment.targetPath);
      const group = grouped.get(key);
      if (group) group.items.push(assignment);
      else grouped.set(key, { path: assignment.targetPath, items: [assignment] });
    }

    for (const { path, items } of grouped.values()) {
      let nodes = root;
      for (let i = 0; i < path.length; i++) {
        const part = path[i] ?? '';
        const currentPath = path.slice(0, i + 1);
        let node = nodes.find(n => n.name === part);
        if (!node) {
          const isNew = items.some((assignment) => {
            const bookmark = bookmarksById.get(assignment.bookmarkId);
            return !bookmark || !existingFolderPaths.has(pathKey(bookmark.rootId, currentPath));
          });
          node = {
            name: part,
            isNew,
            children: [],
            bookmarks: [],
          };
          nodes.push(node);
        }
        if (i === path.length - 1) {
          for (const assignment of items) {
            const b = bookmarksById.get(assignment.bookmarkId);
            node.bookmarks.push({
              id: assignment.bookmarkId,
              title: b?.title || b?.url || assignment.bookmarkId,
              url: b?.url || '',
            });
          }
        }
        nodes = node.children;
      }
    }
    return root;
  }, [assignments, bookmarksById, existingFolderPaths]);

  // 统计新建目录数
  const newFolderCount = useMemo(() => {
    const newFolders = new Set<string>();
    for (const assignment of assignments) {
      const bookmark = bookmarksById.get(assignment.bookmarkId);
      if (!bookmark) continue;
      for (let index = 0; index < assignment.targetPath.length; index++) {
        const path = assignment.targetPath.slice(0, index + 1);
        const key = pathKey(bookmark.rootId, path);
        if (!existingFolderPaths.has(key)) newFolders.add(key);
      }
    }
    return newFolders.size;
  }, [assignments, bookmarksById, existingFolderPaths]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1>预览整理建议</h1>
          <p>书签仅供查看。文件夹标注「新」表示将新建该目录。</p>
        </div>
        <div className="page-stats">
          <div>
            <div className="page-stat-value">{assignments.length}</div>
            <div className="page-stat-label">将移动</div>
          </div>
          <div>
            <div className="page-stat-value">{newFolderCount}</div>
            <div className="page-stat-label">新建目录</div>
          </div>
          <div>
            <div className="page-stat-value">{props.selectedFolderCount}</div>
            <div className="page-stat-label">清理范围</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>整理后的书签目录树</span>
          <span>书签仅供查看</span>
        </div>
        <div className="tree-view">
          {tree.map(node => (
            <TreeFolder key={node.name} node={node} />
          ))}
        </div>
      </div>

      <div className="btn-row-spread">
        <button className="btn btn-outline" onClick={props.onBack}>返回</button>
        <div className="btn-row">
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            仅清理所选文件夹范围内的空目录，可一键撤销
          </span>
          <button className="btn btn-primary" onClick={() => void props.onApply()}>
            应用方案并清理空目录 ({assignments.length} 条) →
          </button>
        </div>
      </div>
    </div>
  );
}

// 树节点组件
function TreeFolder({ node }: {
  node: { name: string; isNew: boolean; children: any[]; bookmarks: any[] };
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
            <TreeFolder key={child.name} node={child} />
          ))}
          {node.bookmarks.map((b: any) => (
            <div key={b.id} className="tree-bookmark">
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
  let count = node.bookmarks.length;
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
  const bookmarkFailures = failures.filter((failure) => failure.bookmarkId !== undefined).length;
  const pending = totalAssignments - applied - bookmarkFailures;
  const percent = totalAssignments > 0 ? Math.round((applied / totalAssignments) * 100) : 0;

  const isApplying = job.status === 'applying' || job.status === 'undoing';

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          {isApplying && (
            <>
              <h1>正在写入书签</h1>
              <p>逐条移动书签，并清理所选范围内的空文件夹</p>
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
              {f.bookmarkId ? `${f.bookmarkId}：` : f.folderId ? `${f.folderId}：` : ''}{f.message}
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
        {(job.status === 'completed' || job.status === 'partially_undone') && applied > 0 && (
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
