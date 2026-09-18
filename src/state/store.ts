/**
 * 应用状态：当前草稿（自动持久化到 localStorage，刷新后恢复）、
 * 撤销/重做栈、情景快照、演练时钟与视图上下文。
 * 所有文档修改都经过 commitDoc 进入历史栈；时钟/上下文不入栈。
 */
import { useSyncExternalStore } from 'react';
import type { ChannelId, Doc, RegionId, Snapshot } from '../domain/types';
import { seedDoc } from '../domain/seed';

export interface AppState {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  snapshots: Snapshot[];
  region: RegionId;
  channel: ChannelId;
  segmentId: string;
  clockMs: number;
  /** 最近一次草稿写入本地的时间（ISO） */
  savedAt: string | null;
  /** 本次启动是否从本地恢复了草稿 */
  restored: boolean;
}

const DOC_KEY = 'rightswindow.doc.v1';
const SNAP_KEY = 'rightswindow.snapshots.v1';
const HISTORY_LIMIT = 50;
/** 内置案例主直播开播后不久的一个有趣时刻 */
const DEFAULT_CLOCK = '2026-09-20T12:10:00Z';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isDoc(x: unknown): x is Doc {
  const d = x as Doc;
  return !!d && d.version === 1 && Array.isArray(d.segments) && Array.isArray(d.assets) && Array.isArray(d.windows);
}

function loadInitialDoc(): { doc: Doc; savedAt: string | null; restored: boolean } {
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(DOC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { doc?: unknown; savedAt?: unknown };
        if (parsed && isDoc(parsed.doc)) {
          return {
            doc: parsed.doc,
            savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
            restored: true,
          };
        }
      }
    } catch {
      // 数据损坏时回退到内置案例
    }
  }
  return { doc: seedDoc(), savedAt: null, restored: false };
}

function loadSnapshots(): Snapshot[] {
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(SNAP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (x): x is Snapshot =>
              !!x && typeof x.id === 'string' && typeof x.name === 'string' && isDoc(x.doc),
          );
        }
      }
    } catch {
      // 忽略损坏的快照列表
    }
  }
  return [];
}

export interface Store {
  getState: () => AppState;
  subscribe: (fn: () => void) => () => void;
  commitDoc: (next: Doc) => void;
  undo: () => void;
  redo: () => void;
  resetAll: () => void;
  saveSnapshot: (name: string) => void;
  loadSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  setContext: (patch: Partial<Pick<AppState, 'region' | 'channel' | 'segmentId'>>) => void;
  setClock: (ms: number) => void;
}

export function createStore(): Store {
  const loaded = loadInitialDoc();
  let state: AppState = {
    doc: loaded.doc,
    past: [],
    future: [],
    snapshots: loadSnapshots(),
    region: 'shanghai',
    channel: 'ott',
    segmentId: 'seg-live',
    clockMs: Date.parse(DEFAULT_CLOCK),
    savedAt: loaded.savedAt,
    restored: loaded.restored,
  };

  const listeners = new Set<() => void>();
  let timer: number | undefined;

  const emit = (): void => {
    listeners.forEach((l) => l());
  };

  const persistNow = (): void => {
    const s = storage();
    if (!s) return;
    try {
      const savedAt = new Date().toISOString();
      s.setItem(DOC_KEY, JSON.stringify({ savedAt, doc: state.doc }));
      s.setItem(SNAP_KEY, JSON.stringify(state.snapshots));
      state = { ...state, savedAt };
      emit();
    } catch {
      // 存储满等异常不阻断编辑
    }
  };

  const schedulePersist = (): void => {
    if (!storage()) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      persistNow();
    }, 250) as unknown as number;
  };

  const set = (patch: Partial<AppState>, persist: boolean): void => {
    state = { ...state, ...patch };
    emit();
    if (persist) schedulePersist();
  };

  const pushHistory = (next: Doc): void => {
    set(
      {
        doc: next,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.doc],
        future: [],
      },
      true,
    );
  };

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    commitDoc: (next) => pushHistory(next),
    undo: () => {
      if (state.past.length === 0) return;
      const prev = state.past[state.past.length - 1];
      set(
        {
          doc: prev,
          past: state.past.slice(0, -1),
          future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        },
        true,
      );
    },
    redo: () => {
      if (state.future.length === 0) return;
      const [next, ...rest] = state.future;
      set(
        {
          doc: next,
          past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
          future: rest,
        },
        true,
      );
    },
    resetAll: () => pushHistory(seedDoc()),
    saveSnapshot: (name) => {
      const snap: Snapshot = {
        id: `snap-${Date.now().toString(36)}`,
        name,
        savedAt: new Date().toISOString(),
        doc: structuredClone(state.doc),
      };
      state = { ...state, snapshots: [snap, ...state.snapshots] };
      emit();
      persistNow();
    },
    loadSnapshot: (id) => {
      const snap = state.snapshots.find((x) => x.id === id);
      if (!snap) return;
      pushHistory(structuredClone(snap.doc));
    },
    deleteSnapshot: (id) => {
      state = { ...state, snapshots: state.snapshots.filter((x) => x.id !== id) };
      emit();
      persistNow();
    },
    setContext: (patch) => set(patch, false),
    setClock: (ms) => set({ clockMs: ms }, false),
  };
}

export const appStore = createStore();

export function useApp(): AppState {
  return useSyncExternalStore(appStore.subscribe, appStore.getState);
}
