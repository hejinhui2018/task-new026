/** 文档编辑操作：全部为纯函数，返回新 Doc，供撤销/重做栈使用。 */
import type { Asset, Doc, RightsWindow } from './types';

export function updateWindow(doc: Doc, id: string, patch: Partial<RightsWindow>): Doc {
  return {
    ...doc,
    windows: doc.windows.map((w) => (w.id === id ? { ...w, ...patch, id: w.id } : w)),
  };
}

export function addWindow(doc: Doc, w: RightsWindow): Doc {
  return { ...doc, windows: [...doc.windows, w] };
}

export function removeWindow(doc: Doc, id: string): Doc {
  return { ...doc, windows: doc.windows.filter((w) => w.id !== id) };
}

export function setChain(doc: Doc, segmentId: string, chain: string[]): Doc {
  return {
    ...doc,
    segments: doc.segments.map((s) => (s.id === segmentId ? { ...s, chain } : s)),
  };
}

export function addAsset(doc: Doc, asset: Asset): Doc {
  return { ...doc, assets: [...doc.assets, asset] };
}

/** 删除素材：其授权窗口一并移除；替代链中的引用保留，形成"断裂"供演练。 */
export function removeAsset(doc: Doc, assetId: string): Doc {
  return {
    ...doc,
    assets: doc.assets.filter((a) => a.id !== assetId),
    windows: doc.windows.filter((w) => w.assetId !== assetId),
  };
}

export function nextWindowId(doc: Doc): string {
  let n = doc.windows.length + 1;
  while (doc.windows.some((w) => w.id === `w-${n}`)) n++;
  return `w-${n}`;
}

export function nextAssetId(doc: Doc): string {
  let n = 1;
  while (doc.assets.some((a) => a.id === `ast-custom-${n}`)) n++;
  return `ast-custom-${n}`;
}
