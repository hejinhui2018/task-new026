import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { ScenarioState } from '../core/types';
import {
  createInitialScenario,
  deepCloneScenario,
  PRESETS,
} from '../core/scenario';
import { toMs } from '../core/time';

const STORAGE_KEY = 'rights-window-workbench:v1';
const HISTORY_LIMIT = 100;

export interface Snapshot {
  id: string;
  name: string;
  savedAtIso: string;
  scenario: ScenarioState;
  clockMs: number;
}

interface PersistShape {
  scenario: ScenarioState;
  clockMs: number;
  regionId: string;
  channelId: string;
  segmentId: string;
  snapshots: Snapshot[];
}

export interface WorkbenchState {
  scenario: ScenarioState;
  clockMs: number;
  regionId: string;
  channelId: string;
  segmentId: string;
  past: ScenarioState[];
  future: ScenarioState[];
  snapshots: Snapshot[];
  /** 上次保存草稿时间（显示用） */
  lastSavedIso: string | null;
}

export type Action =
  | { type: 'commit'; scenario: ScenarioState }
  | { type: 'setClock'; clockMs: number }
  | { type: 'setRegion'; regionId: string }
  | { type: 'setChannel'; channelId: string }
  | { type: 'setSegment'; segmentId: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'applyPreset'; id: string }
  | { type: 'saveSnapshot'; name: string }
  | { type: 'loadSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'hydrate'; payload: PersistShape };

export function defaultClockMs(s: ScenarioState): number {
  // 固定默认时刻：上海直播进行中、伦敦尚未开播（12:30Z = 20:30 上海）
  const t = Date.parse('2026-09-18T12:30:00Z');
  const lo = toMs(s.span.start);
  const hi = toMs(s.span.end);
  return Math.min(Math.max(t, lo), hi - 1);
}

function freshState(): WorkbenchState {
  const scenario = createInitialScenario();
  return {
    scenario,
    clockMs: defaultClockMs(scenario),
    regionId: scenario.regions[0].id,
    channelId: scenario.channels[0].id,
    segmentId: scenario.segments[0].id,
    past: [],
    future: [],
    snapshots: [],
    lastSavedIso: null,
  };
}

function pushHistory(state: WorkbenchState, next: ScenarioState): WorkbenchState {
  const past = [...state.past, deepCloneScenario(state.scenario)].slice(
    -HISTORY_LIMIT,
  );
  return { ...state, scenario: next, past, future: [] };
}

export function reducer(
  state: WorkbenchState,
  action: Action,
): WorkbenchState {
  switch (action.type) {
    case 'commit':
      return pushHistory(state, action.scenario);
    case 'setClock':
      return { ...state, clockMs: action.clockMs };
    case 'setRegion':
      return { ...state, regionId: action.regionId };
    case 'setChannel':
      return { ...state, channelId: action.channelId };
    case 'setSegment':
      return { ...state, segmentId: action.segmentId };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        scenario: deepCloneScenario(previous),
        past: state.past.slice(0, -1),
        future: [deepCloneScenario(state.scenario), ...state.future].slice(
          0,
          HISTORY_LIMIT,
        ),
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        scenario: deepCloneScenario(next),
        past: [...state.past, deepCloneScenario(state.scenario)].slice(
          -HISTORY_LIMIT,
        ),
        future: rest,
      };
    }
    case 'reset':
      return pushHistory(state, createInitialScenario());
    case 'applyPreset': {
      const preset = PRESETS.find((p) => p.id === action.id);
      if (!preset) return state;
      return pushHistory(state, preset.build());
    }
    case 'saveSnapshot': {
      const snap: Snapshot = {
        id: genId('snap'),
        name: action.name,
        savedAtIso: new Date().toISOString(),
        scenario: deepCloneScenario(state.scenario),
        clockMs: state.clockMs,
      };
      return { ...state, snapshots: [...state.snapshots, snap] };
    }
    case 'loadSnapshot': {
      const snap = state.snapshots.find((x) => x.id === action.id);
      if (!snap) return state;
      return {
        ...pushHistory(state, deepCloneScenario(snap.scenario)),
        clockMs: snap.clockMs,
      };
    }
    case 'deleteSnapshot':
      return {
        ...state,
        snapshots: state.snapshots.filter((x) => x.id !== action.id),
      };
    case 'hydrate': {
      const p = action.payload;
      return {
        ...state,
        scenario: p.scenario,
        clockMs: p.clockMs,
        regionId: p.regionId,
        channelId: p.channelId,
        segmentId: p.segmentId,
        snapshots: p.snapshots ?? [],
      };
    }
  }
}

let counter = 0;
export function genId(prefix: string): string {
  counter += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `${counter}${Date.now().toString(36)}`;
  return `${prefix}_${rand}`;
}

/* ----------------------------- 持久化 ----------------------------- */

function loadPersisted(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed.scenario || !Array.isArray(parsed.scenario.windows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: WorkbenchState): void {
  try {
    const payload: PersistShape = {
      scenario: state.scenario,
      clockMs: state.clockMs,
      regionId: state.regionId,
      channelId: state.channelId,
      segmentId: state.segmentId,
      snapshots: state.snapshots,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 存储不可用时静默降级（内存中仍可演练）
  }
}

/* ----------------------------- Context ----------------------------- */

interface Store {
  state: WorkbenchState;
  dispatch: React.Dispatch<Action>;
  /** 以函数式草稿方式修改编排，自动入历史 */
  mutate: (fn: (draft: ScenarioState) => void) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const base = freshState();
    const saved = loadPersisted();
    if (saved) {
      return reducer(base, { type: 'hydrate', payload: saved });
    }
    return base;
  });

  // 刷新恢复：任意状态变化后自动写入草稿
  const savedAt = useMemo(
    () => new Date().toISOString(),
    [
      state.scenario,
      state.clockMs,
      state.regionId,
      state.channelId,
      state.segmentId,
      state.snapshots,
    ],
  );

  useEffect(() => {
    persist({ ...state, lastSavedIso: savedAt });
  }, [
    state.scenario,
    state.clockMs,
    state.regionId,
    state.channelId,
    state.segmentId,
    state.snapshots,
    savedAt,
  ]);

  const mutate = useCallback(
    (fn: (draft: ScenarioState) => void) => {
      const draft = deepCloneScenario(state.scenario);
      fn(draft);
      dispatch({ type: 'commit', scenario: draft });
    },
    [state.scenario],
  );

  const value = useMemo(
    () => ({ state: { ...state, lastSavedIso: savedAt }, dispatch, mutate }),
    [state, savedAt, mutate],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
