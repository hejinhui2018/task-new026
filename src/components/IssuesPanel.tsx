import { useMemo } from 'react';
import { useStore } from '../state/store';
import { describeIssue } from '../core/engine';
import type { Issue } from '../core/types';
import { formatLocalShort } from '../core/time';

const KIND_META: Record<
  Issue['kind'],
  { icon: string; label: string }
> = {
  overlap: { icon: '⛔', label: '窗口重叠' },
  gap: { icon: '⏳', label: '授权空档' },
  'region-mismatch': { icon: '🌍', label: '地区不匹配' },
  'broken-chain': { icon: '🔗', label: '替代链断裂' },
  cycle: { icon: '↻', label: '替代链循环' },
  unlicensed: { icon: '🚫', label: '素材未授权' },
};

export function IssuesPanel({
  issues,
  channelName: _channelName,
}: {
  issues: Issue[];
  channelName: string;
}) {
  const { state, dispatch } = useStore();
  const regionById = useMemo(
    () => new Map(state.scenario.regions.map((r) => [r.id, r])),
    [state.scenario.regions],
  );

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const ordered = [...errors, ...warnings];

  function jumpTo(i: Issue) {
    if (i.regionId) dispatch({ type: 'setRegion', regionId: i.regionId });
    if (i.channelId) dispatch({ type: 'setChannel', channelId: i.channelId });
    if (i.segmentId) dispatch({ type: 'setSegment', segmentId: i.segmentId });
    if (i.startMs !== undefined && Number.isFinite(i.startMs)) {
      const lo = Date.parse(state.scenario.span.start);
      const hi = Date.parse(state.scenario.span.end);
      dispatch({
        type: 'setClock',
        clockMs: Math.min(Math.max(i.startMs, lo), hi - 1),
      });
    }
  }

  return (
    <div className="panel">
      <h2>
        冲突体检{' '}
        {errors.length > 0 && <span className="count-badge">{errors.length}</span>}{' '}
        {warnings.length > 0 && (
          <span className="count-badge warn">{warnings.length}</span>
        )}
        {ordered.length === 0 && <span className="count-badge zero">0</span>}
      </h2>
      {ordered.length === 0 && (
        <div className="empty-hint">
          ✔ 未发现重叠、空档、地区不匹配、断裂或循环问题。
        </div>
      )}
      {ordered.map((i, idx) => {
        const meta = KIND_META[i.kind];
        const region = i.regionId ? regionById.get(i.regionId) : null;
        return (
          <div
            key={idx}
            className={`issue ${i.severity}`}
            onClick={() => jumpTo(i)}
            title="点击跳转到该问题所在的地区 / 渠道 / 时刻"
          >
            <span className="icon">{meta.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="txt">
                <strong>{meta.label}</strong>
                {'　'}
                {describeIssue(state.scenario, i)}
              </div>
              {i.startMs !== undefined &&
                i.endMs !== undefined &&
                region &&
                Number.isFinite(i.startMs) &&
                Number.isFinite(i.endMs) && (
                  <div className="when">
                    {formatLocalShort(i.startMs, region.timeZone)} –{' '}
                    {formatLocalShort(i.endMs, region.timeZone)}（{region.name}当地）
                  </div>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
