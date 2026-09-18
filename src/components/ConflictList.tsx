import { useMemo, useState } from 'react';
import { appStore, useApp } from '../state/store';
import { channelById, regionById } from '../domain/types';
import type { Conflict } from '../domain/conflicts';
import { CONFLICT_TYPE_LABEL, detectConflicts } from '../domain/conflicts';

export default function ConflictList() {
  const s = useApp();
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const all = useMemo(() => detectConflicts(s.doc), [s.doc]);
  const visible = onlyCurrent
    ? all.filter(
        (c) => (!c.region || c.region === s.region) && (!c.channel || c.channel === s.channel),
      )
    : all;

  const locate = (c: Conflict) => {
    appStore.setContext({
      segmentId: c.segmentId,
      ...(c.region ? { region: c.region } : {}),
      ...(c.channel ? { channel: c.channel } : {}),
    });
    const seg = s.doc.segments.find((x) => x.id === c.segmentId);
    appStore.setClock(c.span ? c.span.startMs : seg ? Date.parse(seg.startUtc) : s.clockMs);
    window.dispatchEvent(new Event('rw:show-path'));
  };

  return (
    <div className="conflicts">
      <label className="filter">
        <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} />
        仅看当前地区/渠道
      </label>
      {visible.length === 0 && <div className="muted">当前范围没有检测到冲突。</div>}
      {visible.map((c) => {
        const seg = s.doc.segments.find((x) => x.id === c.segmentId);
        return (
          <div key={c.id} className={`conflict ${c.type}`}>
            <div className="c-head">
              <span className="c-type">{CONFLICT_TYPE_LABEL[c.type]}</span>
              <span className="c-seg">{seg?.name ?? c.segmentId}</span>
              {c.region && <span className="c-ctx">{regionById(c.region).label}</span>}
              {c.channel && <span className="c-ctx">{channelById(c.channel).label}</span>}
            </div>
            <div className="c-msg">{c.message}</div>
            <button className="locate" onClick={() => locate(c)}>
              定位到临界时刻 →
            </button>
          </div>
        );
      })}
    </div>
  );
}
