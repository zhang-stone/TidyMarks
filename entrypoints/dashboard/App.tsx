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
  type PlanRecord,
  type ScanResult,
  type ScannedBookmark,
} from '@/src/shared/schemas';
import { classifyError } from '@/src/shared/errors';

/**
 * Dashboard 全页应用（架构方案第 3.1 节）。
 * 四个页面状态：模型设置 → 扫描选择 → 方案审核 → 执行结果。
 * 模型请求由本页面发起；书签写入全部经由 Service Worker 消息。
 */

type View = 'settings' | 'scan' | 'review' | 'result';

interface AppState {
  view: View;
  settings: ModelSettings | null;
  job: JobState | null;
  scan: ScanResult | null;
  plan: PlanRecord | null;
  /** 方案审核页的本地编辑副本（应用前写回 storage）。 */
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
    return 'review';
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
        view: 'review',
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

const storage = createStorageRepository(chrome.storage.local);

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const jobIdRef = useRef<string>(crypto.randomUUID());

  // ---- 初始化：加载设置 + GET_STATUS 恢复界面（不依赖长连接） ----
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

  // ---- 订阅后台广播事件，刷新任务状态 ----
  useEffect(() => {
    const listener = (raw: unknown): void => {
      const parsed = EventSchema.safeParse(raw);
      if (!parsed.success) return;
      const data = parsed.data;
      if (data.type === 'JOB_PROGRESS') return; // 进度由生成阶段的回调展示
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

  if (state.view === 'settings' || !state.settings) {
    return (
      <SettingsPage
        initial={state.settings}
        onSaved={(settings) => dispatch({ type: 'settingsSaved', settings })}
        onError={(message) => dispatch({ type: 'error', error: message })}
      />
    );
  }

  return (
    <div className="container">
      <header className="card">
        <h1>AI Bookmark Organizer</h1>
        <p className="muted">
          任务状态：{state.job?.status ?? 'idle'}
          {state.busy ? <span className="badge">{state.busy}</span> : null}
        </p>
      </header>

      {state.error ? <p className="error">{state.error}</p> : null}

      {state.view === 'scan' && (
        <ScanPage
          scan={state.scan}
          progress={state.progress}
          busy={state.busy}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
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
          onGenerate={async () => {
            if (!state.settings) return;
            dispatch({ type: 'busy', busy: '正在生成整理方案' });
            try {
              const client = createOpenAICompatibleClient(state.settings);
              const folderNames = (state.scan?.folders ?? []).map((f) => f.title);
              // 扫描完成后任务处于 planning；恢复未完成的管线时沿用当前任务状态。
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
                { model: client, storage },
                currentJob,
                selectedBookmarks,
                folderNames,
                (p) => dispatch({ type: 'planProgress', progress: p }),
              );
              dispatch({ type: 'planDone', plan });
            } catch (error) {
              dispatch({ type: 'error', error: classifyError(error).message });
            } finally {
              dispatch({ type: 'busy', busy: null });
            }
          }}
        />
      )}

      {state.view === 'review' && state.plan && (
        <ReviewPage
          taxonomy={state.plan.taxonomy}
          assignments={state.editedAssignments ?? state.plan.assignments}
          bookmarksById={bookmarksById}
          onChange={(assignments) => dispatch({ type: 'assignments', assignments })}
          onApply={async () => {
            // 编辑结果写回存储，Service Worker 应用时读取同一份方案。
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
            // 清理上一轮方案与扫描数据，避免新任务读到旧状态。
            void storage.clear(['plan', 'scan']);
            dispatch({ type: 'view', view: 'scan' });
          }}
        />
      )}
    </div>
  );
}

// ---------- 模型设置页 ----------

function SettingsPage(props: {
  initial: ModelSettings | null;
  onSaved: (settings: ModelSettings) => void;
  onError: (message: string) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(props.initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(props.initial?.apiKey ?? '');
  const [model, setModel] = useState(props.initial?.model ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
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
      setTestResult('连接成功');
    } catch (error) {
      setTestResult(`连接失败：${classifyError(error).message}`);
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
      // 用户手势内申请精确 Origin；旧 Origin 由用户在浏览器设置中自行管理。
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
    <div className="container">
      <div className="card">
        <h1>AI Bookmark Organizer</h1>
        <p className="muted">
          配置你自己的 OpenAI-compatible API。密钥仅保存在本扩展的本地存储中，
          不会上传到任何第三方服务器。
        </p>
        <label className="field">
          Base URL（HTTPS）
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </label>
        <label className="field">
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </label>
        <label className="field">
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </label>
        <div className="row">
          <button onClick={() => void testConnection()} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button className="primary" onClick={() => void save()}>
            保存并连接
          </button>
        </div>
        {testResult ? <p className="muted">{testResult}</p> : null}
      </div>
    </div>
  );
}

// ---------- 扫描选择页 ----------

function ScanPage(props: {
  scan: ScanResult | null;
  progress: GeneratePlanProgress | null;
  busy: string | null;
  selectedIds: Set<string> | null;
  onSelect: (ids: Set<string> | null) => void;
  onScan: () => void;
  onGenerate: () => void;
}) {
  const { scan, selectedIds } = props;
  const bookmarks = scan?.bookmarks ?? [];
  const selectedCount = selectedIds ? bookmarks.filter((b) => selectedIds.has(b.id)).length : bookmarks.length;

  const toggle = (id: string): void => {
    const next = new Set(selectedIds ?? bookmarks.map((b) => b.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onSelect(next);
  };

  const byRoot = useMemo(() => {
    const groups = new Map<string, ScannedBookmark[]>();
    for (const b of bookmarks) {
      const key = b.rootId;
      const group = groups.get(key);
      if (group) group.push(b);
      else groups.set(key, [b]);
    }
    return groups;
  }, [bookmarks]);

  const rootTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of scan?.roots ?? []) map.set(r.id, r.title);
    return map;
  }, [scan]);

  return (
    <div className="container">
      <div className="card">
        <h2>扫描与选择</h2>
        <p className="muted">
          扫描读取整棵书签树（跳过不可修改节点），默认全选；可按条取消不需要整理的书签。
        </p>
        <div className="row">
          <button onClick={props.onScan} disabled={props.busy !== null}>
            {scan ? '重新扫描' : '扫描书签'}
          </button>
          <button
            className="primary"
            onClick={props.onGenerate}
            disabled={props.busy !== null || selectedCount === 0}
          >
            生成整理方案
          </button>
        </div>
        <p className="stats">
          已扫描 {bookmarks.length} 条书签，当前选择 {selectedCount} 条。
        </p>
        {props.progress ? (
          <p className="progress">
            {props.progress.phase === 'taxonomy' ? '生成目录体系' : '分配书签'}
            ：{props.progress.processed}/{props.progress.total}
          </p>
        ) : null}
      </div>

      {scan ? (
        <div className="card">
          <h2>书签列表</h2>
          <div className="scan-list tree">
            {[...byRoot.entries()].map(([rootId, items]) => (
              <ul key={rootId}>
                <li>
                  <strong>{rootTitles.get(rootId) ?? rootId}</strong>
                  <ul>
                    {items.map((b) => (
                      <li key={b.id}>
                        <label className="row">
                          <input
                            type="checkbox"
                            checked={!selectedIds || selectedIds.has(b.id)}
                            onChange={() => toggle(b.id)}
                          />
                          <span>
                            {b.title || b.url}
                            <span className="badge">{b.path.join(' / ') || '根目录'}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- 方案审核页 ----------

function ReviewPage(props: {
  taxonomy: string[][];
  assignments: Assignment[];
  bookmarksById: Map<string, ScannedBookmark>;
  onChange: (assignments: Assignment[]) => void;
  onApply: () => void;
}) {
  const { assignments } = props;

  // 下拉选项 = 目录体系 ∪ 分配结果中已出现的路径（模型偶发返回体系外路径时也可展示与修改）。
  const options = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const t of props.taxonomy) seen.set(t.join('/'), t);
    for (const a of assignments) seen.set(a.targetPath.join('/'), a.targetPath);
    return [...seen.values()];
  }, [props.taxonomy, assignments]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = a.targetPath.join('/');
      const group = groups.get(key);
      if (group) group.push(a);
      else groups.set(key, [a]);
    }
    return groups;
  }, [assignments]);

  const exclude = (bookmarkId: string): void => {
    props.onChange(assignments.filter((a) => a.bookmarkId !== bookmarkId));
  };

  const move = (bookmarkId: string, path: string[]): void => {
    props.onChange(
      assignments.map((a) =>
        a.bookmarkId === bookmarkId ? { ...a, targetPath: path } : a,
      ),
    );
  };

  return (
    <div className="container">
      <div className="card">
        <h2>方案审核</h2>
        <p className="muted">
          共 {assignments.length} 条书签将被移动。可以逐条排除或修改目标目录，确认后一键应用。
        </p>
        <button className="primary" onClick={props.onApply}>
          一键应用
        </button>
      </div>

      <div className="card tree">
        {[...grouped.entries()].map(([path, items]) => (
          <div key={path}>
            <h2>
              📁 {path}
              <span className="badge">{items.length}</span>
            </h2>
            <ul>
              {items.map((a) => {
                const bookmark = props.bookmarksById.get(a.bookmarkId);
                return (
                  <li key={a.bookmarkId} className="row">
                    <span>{bookmark?.title ?? a.bookmarkId}</span>
                    <select
                      value={a.targetPath.join('/')}
                      onChange={(e) => move(a.bookmarkId, e.target.value.split('/'))}
                    >
                      {options.map((t) => (
                        <option key={t.join('/')} value={t.join('/')}>
                          {t.join('/')}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => exclude(a.bookmarkId)}>排除</button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 执行结果页 ----------

function ResultPage(props: {
  job: JobState;
  busy: string | null;
  onRetry: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onNewRound: () => void;
}) {
  const { job } = props;
  const applied = job.appliedIds.length;
  const failures: FailureItem[] = job.failures;

  const statusText: Record<string, string> = {
    applying: '正在应用整理方案…',
    completed: applied > 0 ? `完成：成功移动 ${applied} 条书签。` : '没有需要移动的书签。',
    interrupted: '已中断。可以从断点继续应用，或撤销已应用的部分。',
    failed: '应用失败，可重试或撤销。',
    undoing: '正在撤销…',
    undone: '已撤销最近一次整理。',
    partially_undone: '部分撤销成功，存在冲突项（见下方列表），可再次尝试撤销。',
  };

  return (
    <div className="container">
      <div className="card">
        <h2>执行结果</h2>
        <p className="muted">{statusText[job.status] ?? `状态：${job.status}`}</p>
        {job.error ? <p className="error">{job.error.message}</p> : null}
        <div className="row">
          {(job.status === 'applying' || job.status === 'undoing') && (
            <button onClick={props.onCancel} disabled={props.busy !== null}>
              中断
            </button>
          )}
          {(job.status === 'failed' || job.status === 'interrupted') && (
            <button className="primary" onClick={props.onRetry} disabled={props.busy !== null}>
              从断点继续 / 重试
            </button>
          )}
          {(job.status === 'completed' ||
            job.status === 'interrupted' ||
            job.status === 'partially_undone' ||
            job.status === 'failed') &&
            applied > 0 && (
              <button onClick={props.onUndo} disabled={props.busy !== null}>
                撤销最近一次整理
              </button>
            )}
          <button onClick={props.onNewRound} disabled={props.busy !== null}>
            开始新一轮整理
          </button>
        </div>
      </div>

      {failures.length > 0 ? (
        <div className="card">
          <h2>失败与冲突（{failures.length}）</h2>
          <ul className="failures">
            {failures.map((f, i) => (
              <li key={f.bookmarkId ?? i}>
                {f.bookmarkId ? `${f.bookmarkId}：` : ''}
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
