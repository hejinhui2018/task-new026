/**
 * 选材解析引擎：给定（段落, 地区, 渠道, 时刻），沿替代链逐环评估，
 * 产出完整决策路径。纯函数、确定性：同一输入永远得到同一输出。
 */
import type { ChannelId, Doc, RegionId, RightsWindow } from './types';

export interface WindowHit {
  /** 最终胜出的窗口 */
  window: RightsWindow;
  /** 该时刻所有同时生效的窗口（>1 即为重叠，按决胜规则排序） */
  contenders: RightsWindow[];
}

export type SkipReason =
  | { kind: 'missing-asset' }
  | { kind: 'no-window'; elsewhere: Array<{ region: RegionId; channel: ChannelId }> }
  | { kind: 'outside'; nearest: RightsWindow; position: 'before' | 'after'; distanceMs: number }
  | { kind: 'cycle' };

export interface ResolveStep {
  assetId: string;
  outcome: 'selected' | 'skipped' | 'broken' | 'cycle';
  hit?: WindowHit;
  reason?: SkipReason;
}

export interface Resolution {
  segmentId: string;
  region: RegionId;
  channel: ChannelId;
  atMs: number;
  steps: ResolveStep[];
  selectedAssetId: string | null;
  selectedWindow: RightsWindow | null;
  /** 替代链走完仍无可用素材 */
  gap: boolean;
}

/** 半开区间 [start, end)：开始时刻立即生效，结束时刻立即失效。 */
export function covers(w: RightsWindow, atMs: number): boolean {
  return atMs >= Date.parse(w.startUtc) && atMs < Date.parse(w.endUtc);
}

/** 稳定排序：开始早 → 结束早 → id 字典序。 */
export function compareWindows(a: RightsWindow, b: RightsWindow): number {
  return (
    Date.parse(a.startUtc) - Date.parse(b.startUtc) ||
    Date.parse(a.endUtc) - Date.parse(b.endUtc) ||
    a.id.localeCompare(b.id)
  );
}

/** 重叠决胜规则：优先级高 → 开始早 → id 字典序。 */
export function compareForWin(a: RightsWindow, b: RightsWindow): number {
  return b.priority - a.priority || Date.parse(a.startUtc) - Date.parse(b.startUtc) || a.id.localeCompare(b.id);
}

export function pickWinner(candidates: RightsWindow[]): RightsWindow {
  return [...candidates].sort(compareForWin)[0];
}

export function resolveAt(
  doc: Doc,
  segmentId: string,
  region: RegionId,
  channel: ChannelId,
  atMs: number,
): Resolution {
  const seg = doc.segments.find((s) => s.id === segmentId);
  const steps: ResolveStep[] = [];
  let selectedAssetId: string | null = null;
  let selectedWindow: RightsWindow | null = null;

  if (seg) {
    const assetById = new Map(doc.assets.map((a) => [a.id, a]));
    const visited = new Set<string>();

    for (const assetId of seg.chain) {
      if (visited.has(assetId)) {
        steps.push({ assetId, outcome: 'cycle', reason: { kind: 'cycle' } });
        break;
      }
      visited.add(assetId);

      if (!assetById.has(assetId)) {
        steps.push({ assetId, outcome: 'broken', reason: { kind: 'missing-asset' } });
        continue;
      }

      const wins = doc.windows
        .filter(
          (w) =>
            w.segmentId === segmentId && w.assetId === assetId && w.region === region && w.channel === channel,
        )
        .sort(compareWindows);

      if (wins.length === 0) {
        // 告诉用户这份素材在哪些地区/渠道其实有授权，便于判断是地区不匹配还是渠道不匹配
        const elsewhere: Array<{ region: RegionId; channel: ChannelId }> = [];
        const seen = new Set<string>();
        for (const w of doc.windows) {
          if (w.segmentId === segmentId && w.assetId === assetId) {
            const key = `${w.region}|${w.channel}`;
            if (!seen.has(key)) {
              seen.add(key);
              elsewhere.push({ region: w.region, channel: w.channel });
            }
          }
        }
        elsewhere.sort((a, b) => a.region.localeCompare(b.region) || a.channel.localeCompare(b.channel));
        steps.push({ assetId, outcome: 'skipped', reason: { kind: 'no-window', elsewhere } });
        continue;
      }

      const covering = wins.filter((w) => covers(w, atMs));
      if (covering.length === 0) {
        // 找最近的窗口说明"差多久生效 / 已失效多久"；wins 已排序，严格小于才替换，保证确定性
        let nearest = wins[0];
        let position: 'before' | 'after' = 'before';
        let distanceMs = Number.POSITIVE_INFINITY;
        for (const w of wins) {
          const s = Date.parse(w.startUtc);
          const e = Date.parse(w.endUtc);
          const pos: 'before' | 'after' = atMs < s ? 'before' : 'after';
          const d = pos === 'before' ? s - atMs : atMs - e;
          if (d < distanceMs) {
            distanceMs = d;
            nearest = w;
            position = pos;
          }
        }
        steps.push({ assetId, outcome: 'skipped', reason: { kind: 'outside', nearest, position, distanceMs } });
        continue;
      }

      const winner = pickWinner(covering);
      steps.push({
        assetId,
        outcome: 'selected',
        hit: { window: winner, contenders: [...covering].sort(compareForWin) },
      });
      selectedAssetId = assetId;
      selectedWindow = winner;
      break;
    }
  }

  return {
    segmentId,
    region,
    channel,
    atMs,
    steps,
    selectedAssetId,
    selectedWindow,
    gap: selectedAssetId === null,
  };
}
