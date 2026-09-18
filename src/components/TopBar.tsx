import { appStore, useApp } from '../state/store';

export default function TopBar() {
  const s = useApp();
  return (
    <header className="topbar">
      <div className="brand">
        RightsWindow
        <span className="sub">授权窗口编排与替换演练台</span>
      </div>
      <div className="doc-title">{s.doc.title}</div>
      <div className="top-actions">
        <button onClick={() => appStore.undo()} disabled={s.past.length === 0} title="撤销上一步编排修改">
          ⟲ 撤销（{s.past.length}）
        </button>
        <button onClick={() => appStore.redo()} disabled={s.future.length === 0} title="重做">
          ⟳ 重做（{s.future.length}）
        </button>
        <button
          className="danger"
          title="恢复内置直播案例的初始编排（可撤销）"
          onClick={() => {
            if (window.confirm('一键复位将恢复内置直播案例的初始编排。\n当前方案会进入撤销历史，可随时找回。确认复位？')) {
              appStore.resetAll();
            }
          }}
        >
          一键复位
        </button>
        <span className="saved">
          {s.savedAt
            ? `草稿已保存 ${new Date(s.savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
            : '草稿未保存'}
          {s.restored ? ' · 已从本地恢复' : ''}
        </span>
      </div>
    </header>
  );
}
