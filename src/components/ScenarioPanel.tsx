import { useState } from 'react';
import { useStore } from '../state/store';
import { PRESETS } from '../core/scenario';
import { formatLocal } from '../core/time';

export function ScenarioPanel() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');

  function saveSnapshot() {
    const finalName =
      name.trim() ||
      `快照 ${state.scenario.regions
        .find((r) => r.id === state.regionId)
        ?.name ?? ''} ${formatLocal(state.clockMs, 'UTC').slice(0, 16)}`;
    dispatch({ type: 'saveSnapshot', name: finalName });
    setName('');
  }

  return (
    <div className="panel">
      <h2>情景与草稿</h2>

      <h3>一键演练情景（在健康案例上注入事故）</h3>
      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="preset-btn"
            onClick={() => dispatch({ type: 'applyPreset', id: p.id })}
            title={p.description}
          >
            {p.name}
            <small>{p.description}</small>
          </button>
        ))}
      </div>

      <h3>情景快照</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          style={{ flex: 1 }}
          placeholder="为当前编排 + 时钟命名，如「撤权演练·20:45」"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveSnapshot()}
        />
        <button className="primary" onClick={saveSnapshot}>
          保存快照
        </button>
      </div>
      {state.snapshots.length === 0 && (
        <div className="empty-hint">
          尚无快照。快照保存完整编排与演练时钟，刷新页面后仍在。
        </div>
      )}
      {state.snapshots.map((s) => (
        <div className="snap-item" key={s.id}>
          <div className="grow">
            <div>{s.name}</div>
            <div className="meta">
              保存于 {new Date(s.savedAtIso).toLocaleString('zh-CN')} · 时钟{' '}
              {formatLocal(s.clockMs, 'UTC').slice(0, 19)}
            </div>
          </div>
          <button className="tiny" onClick={() => dispatch({ type: 'loadSnapshot', id: s.id })}>
            载入
          </button>
          <button
            className="tiny danger"
            onClick={() => {
              if (confirm(`删除快照「${s.name}」？`))
                dispatch({ type: 'deleteSnapshot', id: s.id });
            }}
          >
            删除
          </button>
        </div>
      ))}

      <h3>草稿与复位</h3>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
        所有编辑自动保存为本机草稿（localStorage），刷新或重开页面自动恢复；
        撤销/重做最多保留 100 步，支持 Ctrl/⌘+Z 与 Ctrl/⌘+Shift+Z。
        「一键复位」回到内置的上海/新加坡/伦敦健康案例，不影响已保存的快照。
      </div>
    </div>
  );
}
