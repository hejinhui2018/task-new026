import { useMemo } from 'react';
import { appStore, useApp } from '../state/store';
import { regionById } from '../domain/types';
import { detectConflicts } from '../domain/conflicts';
import { resolveAt } from '../domain/resolve';
import { formatLocalShort } from '../domain/time';

export default function SegmentList() {
  const s = useApp();
  const conflicts = useMemo(() => detectConflicts(s.doc), [s.doc]);
  const iana = regionById(s.region).iana;

  return (
    <div className="panel seglist">
      <h2>节目段落</h2>
      {s.doc.segments.map((seg) => {
        const start = Date.parse(seg.startUtc);
        const end = Date.parse(seg.endUtc);
        const status = s.clockMs < start ? '未开始' : s.clockMs < end ? '播出中' : '已结束';
        const nConf = conflicts.filter(
          (c) =>
            c.segmentId === seg.id &&
            (!c.region || c.region === s.region) &&
            (!c.channel || c.channel === s.channel),
        ).length;
        const res = resolveAt(s.doc, seg.id, s.region, s.channel, s.clockMs);
        const selName = res.selectedAssetId
          ? s.doc.assets.find((a) => a.id === res.selectedAssetId)?.name ?? res.selectedAssetId
          : null;
        return (
          <button
            key={seg.id}
            className={`seg-item ${seg.id === s.segmentId ? 'on' : ''}`}
            onClick={() => appStore.setContext({ segmentId: seg.id })}
          >
            <div className="si-top">
              <span className="si-name">{seg.name}</span>
              {nConf > 0 ? <span className="badge warn">⚠ {nConf}</span> : <span className="badge ok">正常</span>}
            </div>
            <div className="si-sub">
              {formatLocalShort(start, iana)}–{formatLocalShort(end, iana)} · {status}
            </div>
            <div className={`si-sel ${selName ? '' : 'gap'}`}>{selName ? `→ ${selName}` : '→ 空档 ⚠'}</div>
          </button>
        );
      })}
    </div>
  );
}
