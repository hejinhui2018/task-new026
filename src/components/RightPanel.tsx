import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { detectConflicts } from '../domain/conflicts';
import ResolutionPanel from './ResolutionPanel';
import ConflictList from './ConflictList';
import Editors from './Editors';

type Tab = 'path' | 'conflicts' | 'edit';

export default function RightPanel() {
  const s = useApp();
  const [tab, setTab] = useState<Tab>('path');
  const conflicts = useMemo(() => detectConflicts(s.doc), [s.doc]);

  // 冲突列表"定位"后自动切回选材路径，立刻看到该时刻的决策过程
  useEffect(() => {
    const onLocate = () => setTab('path');
    window.addEventListener('rw:show-path', onLocate);
    return () => window.removeEventListener('rw:show-path', onLocate);
  }, []);

  return (
    <div className="panel rightpanel">
      <div className="rtabs">
        <button className={tab === 'path' ? 'on' : ''} onClick={() => setTab('path')}>
          选材路径
        </button>
        <button className={tab === 'conflicts' ? 'on' : ''} onClick={() => setTab('conflicts')}>
          冲突{conflicts.length > 0 && <span className="badge warn">{conflicts.length}</span>}
        </button>
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>
          编排
        </button>
      </div>
      <div className="rbody">
        {tab === 'path' && <ResolutionPanel />}
        {tab === 'conflicts' && <ConflictList />}
        {tab === 'edit' && <Editors />}
      </div>
    </div>
  );
}
