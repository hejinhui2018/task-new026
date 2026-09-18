import { useMemo } from 'react';
import { useApp } from '../state/store';
import { channelById, regionById } from '../domain/types';
import { resolveAt } from '../domain/resolve';
import type { ResolveStep } from '../domain/resolve';
import { stepDetail, stepTitle } from '../domain/explain';
import { formatLocal } from '../domain/time';

const OUTCOME_ICON: Record<ResolveStep['outcome'], string> = {
  selected: '✓',
  skipped: '✗',
  broken: '⚠',
  cycle: '⟳',
};

export default function ResolutionPanel() {
  const s = useApp();
  const seg = s.doc.segments.find((x) => x.id === s.segmentId) ?? s.doc.segments[0];
  const res = useMemo(
    () => (seg ? resolveAt(s.doc, seg.id, s.region, s.channel, s.clockMs) : null),
    [s.doc, seg, s.region, s.channel, s.clockMs],
  );
  if (!seg || !res) return <div className="muted">方案中没有段落。</div>;
  const iana = regionById(s.region).iana;
  const segStart = Date.parse(seg.startUtc);
  const segEnd = Date.parse(seg.endUtc);
  const inAir = s.clockMs >= segStart && s.clockMs < segEnd;
  const selectedName = res.selectedAssetId
    ? s.doc.assets.find((a) => a.id === res.selectedAssetId)?.name ?? res.selectedAssetId
    : null;

  return (
    <div className="resolution">
      <div className="res-head">
        <div className="res-title">{seg.name}</div>
        <div className="res-sub">
          {regionById(s.region).label} · {channelById(s.channel).label} · {formatLocal(s.clockMs, iana)}
        </div>
        {!inAir && (
          <div className="hint-warn">
            当前时刻不在该段落播出时间内（播出 {formatLocal(segStart, iana)} → {formatLocal(segEnd, iana)}
            ），以下仍按相同时刻评估授权。
          </div>
        )}
      </div>

      <div className="path-chips">
        {res.steps.map((st, i) => (
          <span key={i}>
            <span className={`chip ${st.outcome}`}>
              {OUTCOME_ICON[st.outcome]} {stepTitle(st, s.doc)}
            </span>
            {(i < res.steps.length - 1 || res.gap) && <span className="arrow">→</span>}
          </span>
        ))}
        {res.gap && <span className="chip gap">空档</span>}
      </div>

      <ol className="steps">
        {res.steps.map((st, i) => (
          <li key={i} className={st.outcome}>
            <b>
              {i + 1}. {stepTitle(st, s.doc)}
            </b>
            <div>{stepDetail(st, s.region, s.channel)}</div>
          </li>
        ))}
      </ol>

      <div className={`final ${res.gap ? 'gap' : 'ok'}`}>
        {res.gap
          ? '⚠ 空档：替代链全部走完仍无可用素材'
          : `最终选材：${selectedName}（窗口「${res.selectedWindow?.note ?? res.selectedWindow?.id}」）`}
      </div>
    </div>
  );
}
