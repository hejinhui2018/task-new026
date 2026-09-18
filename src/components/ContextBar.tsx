import { appStore, useApp } from '../state/store';
import { CHANNELS, REGIONS } from '../domain/types';
import { offsetLabel } from '../domain/time';

export default function ContextBar() {
  const s = useApp();
  return (
    <div className="contextbar">
      <div className="tabs">
        <span className="tabs-label">地区</span>
        {REGIONS.map((r) => (
          <button
            key={r.id}
            className={r.id === s.region ? 'on' : ''}
            onClick={() => appStore.setContext({ region: r.id })}
          >
            {r.label}
            <span className="off">{offsetLabel(s.clockMs, r.iana)}</span>
          </button>
        ))}
      </div>
      <div className="tabs">
        <span className="tabs-label">渠道</span>
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            className={c.id === s.channel ? 'on' : ''}
            onClick={() => appStore.setContext({ channel: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="hint">拖动时间轴或滑杆移动演练时钟，观察生效前 / 临界时刻 / 失效后的实际选材</div>
    </div>
  );
}
