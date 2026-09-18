import { useStore } from '../state/store';
import {
  formatLocal,
  formatLocalShort,
  tzAbbr,
  toIso,
} from '../core/time';

/** 演练时钟：拖动总滑块，显示四地（UTC + 三地）当地时间，并提供边界跳转 */
export function ClockPanel({
  clockMs,
  spanLo,
  spanHi,
  timeZone,
}: {
  clockMs: number;
  spanLo: number;
  spanHi: number;
  timeZone: string;
}) {
  const { state, dispatch } = useStore();
  const regions = state.scenario.regions;
  const segmentId = state.segmentId;
  const regionId = state.regionId;

  // 收集可跳转的关键边界：当前地区段落起止与各素材窗口起止
  const boundaries = (() => {
    const set = new Map<number, string>();
    const seg = state.scenario.segments.find((x) => x.id === segmentId);
    const sched = seg?.scheduleByRegion[regionId];
    if (sched) {
      set.set(Date.parse(sched.start), '段落开始');
      set.set(Date.parse(sched.end), '段落结束');
    }
    for (const w of state.scenario.windows) {
      if (w.regionId !== regionId) continue;
      if (w.start) set.set(Date.parse(w.start), `${shortMat(w.materialId)}起`);
      if (w.end) set.set(Date.parse(w.end), `${shortMat(w.materialId)}止`);
    }
    return [...set.entries()]
      .filter(([t]) => t >= spanLo && t <= spanHi)
      .sort((a, b) => a[0] - b[0]);
  })();

  function shortMat(id: string) {
    return state.scenario.materials.find((m) => m.id === id)?.name.slice(0, 6) ?? id;
  }

  const STEP = 60_000;

  return (
    <div className="panel">
      <h2>演练时钟（绝对时刻，拖动观察生效前 / 临界 / 失效后）</h2>
      <div className="clock-readouts">
        <div className={`clock-cell ${timeZone === 'UTC' ? 'active' : ''}`}>
          <div className="city">
            <span>UTC 协调世界时</span>
          </div>
          <div className="time">{formatLocal(clockMs, 'UTC').replace(' (UTC+00:00)', '')}</div>
          <div className="utc">{toIso(clockMs)}</div>
        </div>
        {regions.map((r) => (
          <div key={r.id} className={`clock-cell ${r.id === regionId ? 'active' : ''}`}>
            <div className="city">
              <span>{r.name}</span>
              <span>{tzAbbr(clockMs, r.timeZone)}</span>
            </div>
            <div className="time">{formatLocal(clockMs, r.timeZone).replace(/ \(UTC[+-][\d:]+\)/, '')}</div>
            <div className="utc">
              {formatLocal(clockMs, r.timeZone).match(/\(UTC[+-][\d:]+\)/)?.[0]} ·{' '}
              {r.timeZone}
            </div>
          </div>
        ))}
      </div>

      <div className="slider-row">
        <input
          type="range"
          min={spanLo}
          max={spanHi - 1}
          step={STEP}
          value={clockMs}
          onChange={(e) =>
            dispatch({ type: 'setClock', clockMs: Number(e.target.value) })
          }
        />
      </div>
      <div className="slider-scale">
        <span>{formatLocalShort(spanLo, timeZone)}</span>
        <span>{formatLocalShort(clockMs, timeZone)}（查看地区当地时间）</span>
        <span>{formatLocalShort(spanHi, timeZone)}</span>
      </div>

      <div className="jump-row">
        <span style={{ color: 'var(--text-faint)', fontSize: 12, alignSelf: 'center' }}>
          跳到关键边界：
        </span>
        {boundaries.map(([t, label]) => {
          const isNow = t === clockMs;
          return (
            <button
              key={t}
              className={`tiny ${isNow ? 'primary' : ''}`}
              onClick={() => dispatch({ type: 'setClock', clockMs: t })}
            >
              {label}
            </button>
          );
        })}
        <button
          className="tiny ghost"
          onClick={() => dispatch({ type: 'setClock', clockMs: Math.max(spanLo, clockMs - 15 * 60_000) })}
        >
          −15 分钟
        </button>
        <button
          className="tiny ghost"
          onClick={() => dispatch({ type: 'setClock', clockMs: Math.min(spanHi - 1, clockMs + 15 * 60_000) })}
        >
          +15 分钟
        </button>
      </div>
    </div>
  );
}
