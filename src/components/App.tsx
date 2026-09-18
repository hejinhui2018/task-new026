import { useEffect, useMemo } from 'react';
import { useStore } from '../state/store';
import { detectIssues, evaluateSegment } from '../core/engine';
import { toMs } from '../core/time';
import { ClockPanel } from './ClockPanel';
import { SelectionPanel } from './SelectionPanel';
import { TimelinePanel } from './TimelinePanel';
import { IssuesPanel } from './IssuesPanel';
import { EditorsPanel } from './EditorsPanel';
import { ScenarioPanel } from './ScenarioPanel';

export function App() {
  const { state, dispatch } = useStore();
  const { scenario, clockMs, regionId, channelId, segmentId } = state;

  const segment = useMemo(
    () => scenario.segments.find((s) => s.id === segmentId) ?? scenario.segments[0],
    [scenario.segments, segmentId],
  );
  const region = scenario.regions.find((r) => r.id === regionId)!;
  const channel = scenario.channels.find((c) => c.id === channelId)!;

  const evaluation = useMemo(
    () =>
      segment
        ? evaluateSegment(scenario, segment, regionId, channelId, clockMs)
        : null,
    [scenario, segment, regionId, channelId, clockMs],
  );

  const issues = useMemo(() => detectIssues(scenario, { stepMs: 60_000 }), [scenario]);

  // 撤销/重做快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // 若当前选择被编辑操作删除，回退到第一个可选项
  useEffect(() => {
    if (!scenario.regions.some((r) => r.id === regionId))
      dispatch({ type: 'setRegion', regionId: scenario.regions[0]?.id ?? '' });
    if (!scenario.channels.some((c) => c.id === channelId))
      dispatch({ type: 'setChannel', channelId: scenario.channels[0]?.id ?? '' });
    if (!scenario.segments.some((s) => s.id === segmentId))
      dispatch({ type: 'setSegment', segmentId: scenario.segments[0]?.id ?? '' });
  }, [scenario, regionId, channelId, segmentId, dispatch]);

  const spanLo = toMs(scenario.span.start);
  const spanHi = toMs(scenario.span.end);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>RightsWindow · 授权窗口编排与替换演练台</h1>
          <div className="sub">
            {scenario.name}　·　半开区间 [开始, 结束)，所有时刻内部以 UTC 绝对时间存储
          </div>
        </div>
        <div className="header-spacer" />
        <div className="header-actions">
          <button
            onClick={() => dispatch({ type: 'undo' })}
            disabled={state.past.length === 0}
            title="撤销 (Ctrl/⌘+Z)"
          >
            ↶ 撤销
          </button>
          <button
            onClick={() => dispatch({ type: 'redo' })}
            disabled={state.future.length === 0}
            title="重做 (Ctrl/⌘+Shift+Z)"
          >
            ↷ 重做
          </button>
          <button
            className="danger ghost"
            onClick={() => {
              if (confirm('一键复位：恢复内置健康案例？当前草稿与快照保留在浏览器中。'))
                dispatch({ type: 'reset' });
            }}
          >
            一键复位
          </button>
          {state.lastSavedIso && (
            <span className="save-hint">
              草稿已自动保存于{' '}
              {new Date(state.lastSavedIso).toLocaleTimeString('zh-CN')}
            </span>
          )}
        </div>
      </header>

      <div className="panel">
        <div className="toolbar">
          <label className="field">
            节目段落
            <select
              value={segment?.id ?? ''}
              onChange={(e) => dispatch({ type: 'setSegment', segmentId: e.target.value })}
            >
              {scenario.segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            查看地区（当地时间）
            <select
              value={regionId}
              onChange={(e) => dispatch({ type: 'setRegion', regionId: e.target.value })}
            >
              {scenario.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{r.timeZone}）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            投放渠道
            <select
              value={channelId}
              onChange={(e) => dispatch({ type: 'setChannel', channelId: e.target.value })}
            >
              {scenario.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ClockPanel
        clockMs={clockMs}
        spanLo={spanLo}
        spanHi={spanHi}
        timeZone={region.timeZone}
      />

      <div className="grid">
        <div className="col">
          {evaluation && segment && (
            <SelectionPanel evaluation={evaluation} segmentName={segment.name} />
          )}
          <TimelinePanel />
          <EditorsPanel />
        </div>
        <div className="col">
          <IssuesPanel issues={issues} channelName={channel.name} />
          <ScenarioPanel />
        </div>
      </div>
    </div>
  );
}
