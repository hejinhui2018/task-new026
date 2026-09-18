import { useStore } from '../state/store';
import type { Material } from '../core/types';
import { contains, formatLocalShort, toMs } from '../core/time';

const KIND_CLASS: Record<Material['kind'], string> = {
  main: 'main',
  regional: 'regional',
  slate: 'slate',
};

/** 时间轴：按所选地区的当地墙钟排刻度，窗口位置以绝对时间计算（跨地区可对齐） */
export function TimelinePanel() {
  const { state } = useStore();
  const { scenario, clockMs, regionId, channelId, segmentId } = state;
  const region = scenario.regions.find((r) => r.id === regionId)!;
  const segment = scenario.segments.find((s) => s.id === segmentId)!;
  const schedule = segment.scheduleByRegion[regionId];

  const lo = toMs(scenario.span.start);
  const hi = toMs(scenario.span.end);
  const span = hi - lo;
  const pct = (t: number) => `${((t - lo) / span) * 100}%`;

  // 链中出现的素材（去重保序）；无安排时显示该地区全部出现过窗口的素材
  const chainIds = schedule?.chain ?? [];
  const rowMaterials: Material[] = chainIds
    .map((id) => scenario.materials.find((m) => m.id === id))
    .filter((m): m is Material => Boolean(m));
  if (rowMaterials.length === 0) {
    scenario.materials
      .filter((m) => scenario.windows.some((w) => w.materialId === m.id && w.regionId === regionId))
      .forEach((m) => rowMaterials.push(m));
  }

  const ticks: number[] = [];
  const TICK_COUNT = 8;
  for (let i = 0; i <= TICK_COUNT; i++) ticks.push(lo + Math.round((span * i) / TICK_COUNT));

  const schedLo = schedule ? toMs(schedule.start) : null;
  const schedHi = schedule ? toMs(schedule.end) : null;

  return (
    <div className="panel">
      <h2>
        授权窗口时间轴 · {region.name}当地时间
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>
          斜线填充 = 窗口存在但不覆盖当前渠道（{scenario.channels.find((c) => c.id === channelId)?.name}）
        </span>
      </h2>

      {rowMaterials.map((m) => {
        const wins = scenario.windows.filter(
          (w) => w.materialId === m.id && w.regionId === regionId,
        );
        return (
          <div className="tl-row" key={m.id}>
            <div className="tl-label" title={m.name}>
              {m.name.length > 6 ? m.name.slice(0, 6) + '…' : m.name}
            </div>
            <div className="tl-track">
              {wins.map((w) => {
                const s = w.start ? toMs(w.start) : lo;
                const e = w.end ? toMs(w.end) : hi;
                const chMatch =
                  w.channelIds.length === 0 || w.channelIds.includes(channelId);
                const activeNow =
                  chMatch && contains(clockMs, s, e);
                return (
                  <div
                    key={w.id}
                    className={`tl-bar ${KIND_CLASS[m.kind]} ${chMatch ? '' : 'blocked'}`}
                    style={{
                      left: pct(Math.max(s, lo)),
                      width: `${Math.max(0.5, ((Math.min(e, hi) - Math.max(s, lo)) / span) * 100)}%`,
                      opacity: activeNow ? 1 : 0.62,
                      outline: activeNow ? '2px solid #fff' : 'none',
                    }}
                    title={`${w.label ?? w.id}\n${formatLocalShort(s, region.timeZone)} – ${formatLocalShort(e, region.timeZone)}${
                      chMatch ? '' : '（渠道不匹配）'
                    }`}
                  >
                    {w.label ?? w.id}
                  </div>
                );
              })}
              {wins.length === 0 && (
                <span
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: 5,
                    fontSize: 10.5,
                    color: 'var(--err)',
                  }}
                >
                  该地区无授权窗口
                </span>
              )}
              {schedLo !== null && (
                <div
                  className="tl-schedule"
                  style={{ left: pct(schedLo), width: `${((schedHi! - schedLo) / span) * 100}%` }}
                />
              )}
              <div className="tl-now" style={{ left: pct(clockMs) }} />
            </div>
          </div>
        );
      })}

      <div className="tl-axis">
        <div />
        <div className="tl-ticks">
          {ticks.map((t, i) => (
            <span key={i} className="tl-tick" style={{ left: pct(t) }}>
              {formatLocalShort(t, region.timeZone)}
            </span>
          ))}
        </div>
      </div>

      <div className="tl-legend">
        <span><i className="sw" style={{ background: 'var(--accent)' }} />主片</span>
        <span><i className="sw" style={{ background: 'var(--ok)' }} />区域版</span>
        <span><i className="sw" style={{ background: 'var(--slate)' }} />安全垫片</span>
        <span><i className="sw" style={{ background: 'repeating-linear-gradient(45deg,var(--warn),var(--warn) 3px,#d9922e 3px,#d9922e 6px)' }} />渠道不匹配</span>
        <span><i className="sw" style={{ background: 'transparent', border: '1px dashed var(--border-strong)' }} />播出时段</span>
        <span><i className="sw" style={{ background: '#fff' }} />演练时刻</span>
      </div>
    </div>
  );
}
