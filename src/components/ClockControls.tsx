import { useMemo } from 'react';
import { appStore, useApp } from '../state/store';
import { REGIONS, regionById } from '../domain/types';
import { formatLocal, formatLocalShort, offsetLabel } from '../domain/time';
import { getKeyMoments, getViewRange } from '../domain/view';

const NUDGES: Array<[number, string]> = [
  [-60_000, '-1 分钟'],
  [-10_000, '-10 秒'],
  [-1_000, '-1 秒'],
  [1_000, '+1 秒'],
  [10_000, '+10 秒'],
  [60_000, '+1 分钟'],
];

export default function ClockControls() {
  const s = useApp();
  const range = useMemo(() => getViewRange(s.doc), [s.doc]);
  const moments = useMemo(
    () => getKeyMoments(s.doc, s.segmentId, s.region, s.channel),
    [s.doc, s.segmentId, s.region, s.channel],
  );
  const iana = regionById(s.region).iana;
  const prev = [...moments].reverse().find((m) => m < s.clockMs);
  const next = moments.find((m) => m > s.clockMs);
  const clamped = Math.min(range.endMs, Math.max(range.startMs, s.clockMs));

  return (
    <div className="panel clock-panel">
      <div className="clocks">
        {REGIONS.map((r) => (
          <div key={r.id} className={`clock ${r.id === s.region ? 'on' : ''}`}>
            <div className="c-label">
              {r.label} <span>{offsetLabel(s.clockMs, r.iana)}</span>
            </div>
            <div className="c-time">{formatLocal(s.clockMs, r.iana)}</div>
          </div>
        ))}
        <div className="clock">
          <div className="c-label">UTC</div>
          <div className="c-time">{formatLocal(s.clockMs, 'UTC')}</div>
        </div>
      </div>
      <div className="scrub">
        <button
          onClick={() => prev !== undefined && appStore.setClock(prev)}
          disabled={prev === undefined}
          title="上一个关键时刻"
        >
          ◀
        </button>
        <input
          type="range"
          min={range.startMs}
          max={range.endMs}
          step={1000}
          value={clamped}
          onChange={(e) => appStore.setClock(Number(e.target.value))}
        />
        <button
          onClick={() => next !== undefined && appStore.setClock(next)}
          disabled={next === undefined}
          title="下一个关键时刻"
        >
          ▶
        </button>
      </div>
      <div className="nudges">
        {NUDGES.map(([d, label]) => (
          <button key={label} onClick={() => appStore.setClock(s.clockMs + d)}>
            {label}
          </button>
        ))}
        <span className="muted">关键时刻：</span>
        <div className="moments">
          {moments.map((m) => (
            <button
              key={m}
              className={`moment ${m === s.clockMs ? 'on' : ''}`}
              title={formatLocal(m, iana)}
              onClick={() => appStore.setClock(m)}
            >
              {formatLocalShort(m, iana)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
