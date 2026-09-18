import { useMemo, useRef } from 'react';
import { appStore, useApp } from '../state/store';
import type { AssetKind, Doc, Segment } from '../domain/types';
import { regionById } from '../domain/types';
import type { Conflict } from '../domain/conflicts';
import { detectConflicts } from '../domain/conflicts';
import { covers } from '../domain/resolve';
import { formatLocal, formatLocalShort } from '../domain/time';
import { getViewRange } from '../domain/view';
import type { ViewRange } from '../domain/view';

interface Lane {
  assetId: string;
  name: string;
  kind: AssetKind | 'missing';
  missing: boolean;
  dup: boolean;
}

export default function Timeline() {
  const s = useApp();
  const range = useMemo(() => getViewRange(s.doc), [s.doc]);
  const conflicts = useMemo(() => detectConflicts(s.doc), [s.doc]);
  const iana = regionById(s.region).iana;

  const pct = (ms: number): number => ((ms - range.startMs) / (range.endMs - range.startMs)) * 100;
  const pctC = (ms: number): number => Math.min(100, Math.max(0, pct(ms)));

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const msFromClientX = (clientX: number): number => {
    const el = bodyRef.current;
    if (!el) return s.clockMs;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(range.startMs + ratio * (range.endMs - range.startMs));
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = 10 * 60_000;
    for (let t = Math.ceil(range.startMs / step) * step; t <= range.endMs; t += step) out.push(t);
    return out;
  }, [range]);

  return (
    <div className="panel timeline">
      <div className="tl-ruler">
        {ticks.map((t) => (
          <span key={t} className="tick" style={{ left: `${pctC(t)}%` }}>
            {formatLocalShort(t, iana)}
          </span>
        ))}
      </div>
      <div
        className="tl-body"
        ref={bodyRef}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          appStore.setClock(msFromClientX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) appStore.setClock(msFromClientX(e.clientX));
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {s.doc.segments.map((seg) => (
          <SegmentBlock
            key={seg.id}
            seg={seg}
            doc={s.doc}
            range={range}
            conflicts={conflicts}
            selected={seg.id === s.segmentId}
            clockMs={s.clockMs}
            iana={iana}
          />
        ))}
        <div className="now-line" style={{ left: `${pctC(s.clockMs)}%` }}>
          <div className="now-dot" />
        </div>
      </div>
      <div className="legend">
        <span>
          <i className="sw kind-main" />主片
        </span>
        <span>
          <i className="sw kind-regional" />区域版
        </span>
        <span>
          <i className="sw kind-safety" />安全垫片
        </span>
        <span>
          <i className="sw kind-ad" />广告
        </span>
        <span>
          <i className="sw sw-gap" />空档
        </span>
        <span>
          <i className="sw sw-overlap" />重叠
        </span>
        <span className="muted">虚线框为段落播出时段；点击 / 拖动时间轴移动演练时钟</span>
      </div>
    </div>
  );
}

function SegmentBlock({
  seg,
  doc,
  range,
  conflicts,
  selected,
  clockMs,
  iana,
}: {
  seg: Segment;
  doc: Doc;
  range: ViewRange;
  conflicts: Conflict[];
  selected: boolean;
  clockMs: number;
  iana: string;
}) {
  const s = useApp();
  const pct = (ms: number): number => ((ms - range.startMs) / (range.endMs - range.startMs)) * 100;
  const spanStyle = (aMs: number, bMs: number): { left: string; width: string } | null => {
    const l = Math.min(100, Math.max(0, pct(aMs)));
    const r = Math.min(100, Math.max(0, pct(bMs)));
    if (r <= 0 || l >= 100 || r <= l) return null;
    return { left: `${l}%`, width: `${r - l}%` };
  };

  const assetById = new Map(doc.assets.map((a) => [a.id, a]));
  const wins = doc.windows.filter(
    (w) => w.segmentId === seg.id && w.region === s.region && w.channel === s.channel,
  );
  const segConflicts = conflicts.filter(
    (c) =>
      c.segmentId === seg.id &&
      (!c.region || c.region === s.region) &&
      (!c.channel || c.channel === s.channel),
  );
  const gaps = segConflicts.filter((c) => c.type === 'gap');
  const overlaps = segConflicts.filter((c) => c.type === 'overlap');

  // 每个链上素材一条泳道；重复引用的素材标"重复"，已删除的标"缺失"
  const lanes: Lane[] = [];
  const seen = new Set<string>();
  for (const id of seg.chain) {
    const a = assetById.get(id);
    lanes.push({
      assetId: id,
      name: a ? a.name : `未知素材 ${id}`,
      kind: a ? a.kind : 'missing',
      missing: !a,
      dup: seen.has(id),
    });
    seen.add(id);
  }

  const segStart = Date.parse(seg.startUtc);
  const segEnd = Date.parse(seg.endUtc);
  const airtime = spanStyle(segStart, segEnd);

  return (
    <div className={`seg-block ${selected ? 'selected' : ''}`}>
      <div
        className="seg-head"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => appStore.setContext({ segmentId: seg.id })}
        title="点击选中该段落"
      >
        <span className="seg-name">{seg.name}</span>
        <span className="seg-time">
          {formatLocal(segStart, iana)} → {formatLocal(segEnd, iana)}
        </span>
        {segConflicts.length > 0 && <span className="badge warn">⚠ {segConflicts.length}</span>}
      </div>
      <div className="lanes">
        {lanes.map((lane, i) => (
          <div className="lane" key={`${lane.assetId}-${i}`}>
            <span className={`lane-tag kind-${lane.kind}`}>
              {lane.name}
              {lane.dup ? '（重复）' : ''}
              {lane.missing ? ' ⚠ 已删除' : ''}
            </span>
            {airtime && <div className="airtime" style={airtime} />}
            {wins
              .filter((w) => w.assetId === lane.assetId)
              .map((w) => {
                const ws = Date.parse(w.startUtc);
                const we = Date.parse(w.endUtc);
                const style = spanStyle(ws, we);
                if (!style) return null;
                const on = covers(w, clockMs);
                return (
                  <div
                    key={w.id}
                    className={`bar kind-${lane.kind} ${on ? 'on' : ''}`}
                    style={style}
                    title={`${lane.name}\n${formatLocal(ws, iana)} → ${formatLocal(we, iana)}\n优先级 ${w.priority}${w.note ? `\n${w.note}` : ''}`}
                  />
                );
              })}
            {i === 0 &&
              gaps.map(
                (g) =>
                  g.span && (
                    <div
                      key={g.id}
                      className="gap-mark"
                      style={spanStyle(g.span.startMs, g.span.endMs) ?? undefined}
                      title={g.message}
                    />
                  ),
              )}
            {overlaps
              .filter((o) => o.assetIds[0] === lane.assetId)
              .map(
                (o) =>
                  o.span && (
                    <div
                      key={o.id}
                      className="overlap-mark"
                      style={spanStyle(o.span.startMs, o.span.endMs) ?? undefined}
                      title={o.message}
                    />
                  ),
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
