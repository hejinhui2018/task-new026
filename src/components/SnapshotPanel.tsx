import { useState } from 'react';
import { appStore, useApp } from '../state/store';

export default function SnapshotPanel() {
  const s = useApp();
  const [name, setName] = useState('');

  const save = () => {
    appStore.saveSnapshot(name.trim() || `快照 ${s.snapshots.length + 1}`);
    setName('');
  };

  return (
    <div className="panel snapshots">
      <h2>情景快照</h2>
      <div className="snap-save">
        <input
          type="text"
          placeholder="快照名称，如：撤权演练 A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button onClick={save}>保存</button>
      </div>
      {s.snapshots.length === 0 && <div className="muted">暂无快照。把当前编排存成快照，可随时载入对比。</div>}
      {s.snapshots.map((snap) => (
        <div key={snap.id} className="snap-row">
          <div className="snap-meta">
            <div className="snap-name">{snap.name}</div>
            <div className="snap-time">{new Date(snap.savedAt).toLocaleString('zh-CN', { hour12: false })}</div>
          </div>
          <button onClick={() => appStore.loadSnapshot(snap.id)} title="载入该快照（当前方案进入撤销历史）">
            载入
          </button>
          <button
            className="del"
            onClick={() => {
              if (window.confirm(`删除快照「${snap.name}」？`)) appStore.deleteSnapshot(snap.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
