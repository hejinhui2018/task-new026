import { useEffect } from 'react';
import { appStore } from './state/store';
import TopBar from './components/TopBar';
import ContextBar from './components/ContextBar';
import SegmentList from './components/SegmentList';
import SnapshotPanel from './components/SnapshotPanel';
import ClockControls from './components/ClockControls';
import Timeline from './components/Timeline';
import RightPanel from './components/RightPanel';

export default function App() {
  // 键盘微调演练时钟：←/→ ±10 秒，Shift+←/→ ±1 分钟
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const step = e.shiftKey ? 60_000 : 10_000;
      if (e.key === 'ArrowLeft') {
        appStore.setClock(appStore.getState().clockMs - step);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        appStore.setClock(appStore.getState().clockMs + step);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <ContextBar />
      <main className="main">
        <aside className="left">
          <SegmentList />
          <SnapshotPanel />
        </aside>
        <section className="center">
          <ClockControls />
          <Timeline />
        </section>
        <RightPanel />
      </main>
    </div>
  );
}
