/**
 * 冲突检测：扫描整份方案，找出授权重叠、空档、地区不匹配、替代链断裂与循环，
 * 并为每条冲突生成带本地时间的可读解释。纯函数、确定性输出。
 */
import type { ChannelId, Doc, RegionId, RightsWindow } from './types';
import { CHANNELS, REGIONS, channelById, regionById } from './types';
import { pickWinner } from './resolve';
import { formatLocal, fmtDuration } from './time';

export type ConflictType = 'overlap' | 'gap' | 'region-mismatch' | 'broken-chain' | 'cycle';

export interface Conflict {
  /** 由内容决定的确定性 id */
  id: string;
  type: ConflictType;
  segmentId: string;
  region?: RegionId;
  channel?: ChannelId;
  assetIds: string[];
  windowIds: string[];
  /** 受影响的 UTC 时间段（断裂/循环类为 null） */
  span: { startMs: number; endMs: number } | null;
  message: string;
}

export const CONFLICT_TYPE_LABEL: Record<ConflictType, string> = {
  overlap: '授权重叠',
  gap: '授权空档',
  'region-mismatch': '地区不匹配',
  'broken-chain': '替代链断裂',
  cycle: '替代链循环',
};

/**
 * 在 [aMs, bMs) 内求 intervals 未覆盖的子区间。
 * intervals 首尾相接（end === start）不算空档。
 */
export function computeGaps(
  intervals: Array<readonly [number, number]>,
  aMs: number,
  bMs: number,
): Array<[number, number]> {
  const clipped = intervals
    .filter(([s, e]) => e > aMs && s < bMs)
    .map(([s, e]) => [Math.max(s, aMs), Math.min(e, bMs)] as [number, number])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const gaps: Array<[number, number]> = [];
  let cur = aMs;
  for (const [s, e] of clipped) {
    if (s > cur) gaps.push([cur, s]);
    if (e > cur) cur = e;
    if (cur >= bMs) break;
  }
  if (cur < bMs) gaps.push([cur, bMs]);
  return gaps;
}

const TYPE_ORDER: Record<ConflictType, number> = {
  overlap: 0,
  gap: 1,
  'region-mismatch': 2,
  'broken-chain': 3,
  cycle: 4,
};

export function detectConflicts(doc: Doc): Conflict[] {
  const out: Conflict[] = [];
  const assetById = new Map(doc.assets.map((a) => [a.id, a]));
  const assetName = (id: string): string => assetById.get(id)?.name ?? id;
  const winName = (w: RightsWindow): string => (w.note ? `「${w.note}」` : `窗口 ${w.id}`);

  for (const seg of doc.segments) {
    const segStart = Date.parse(seg.startUtc);
    const segEnd = Date.parse(seg.endUtc);

    // —— 替代链断裂：引用了不存在的素材 ——
    const missing = [...new Set(seg.chain.filter((id) => !assetById.has(id)))];
    for (const m of missing) {
      out.push({
        id: `broken-chain|${seg.id}|${m}`,
        type: 'broken-chain',
        segmentId: seg.id,
        assetIds: [m],
        windowIds: [],
        span: null,
        message: `替代链第 ${seg.chain.indexOf(m) + 1} 环引用了不存在的素材「${m}」（可能已从素材库删除），链条在此断裂，演练时该环会被跳过。`,
      });
    }

    // —— 替代链循环：同一素材重复出现 ——
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const id of seg.chain) {
      if (seen.has(id) && !dups.includes(id)) dups.push(id);
      seen.add(id);
    }
    if (dups.length > 0) {
      out.push({
        id: `cycle|${seg.id}|${dups.join(',')}`,
        type: 'cycle',
        segmentId: seg.id,
        assetIds: dups,
        windowIds: [],
        span: null,
        message: `素材 ${dups.map((id) => `「${assetName(id)}」`).join('、')} 在替代链中重复出现，演练走到重复处会判定为循环并停止，其后的环节永远不会生效。`,
      });
    }

    // —— 按 地区 × 渠道 检查重叠 / 空档 / 地区不匹配 ——
    const segWins = doc.windows.filter((w) => w.segmentId === seg.id);
    const regionsWith = new Set(segWins.map((w) => w.region));

    for (const region of REGIONS) {
      if (!regionsWith.has(region.id)) {
        if (regionsWith.size > 0) {
          out.push({
            id: `region-mismatch|${seg.id}|${region.id}`,
            type: 'region-mismatch',
            segmentId: seg.id,
            region: region.id,
            assetIds: [],
            windowIds: [],
            span: { startMs: segStart, endMs: segEnd },
            message: `该段落在${region.label}没有任何授权窗口（已授权地区：${[...regionsWith]
              .sort()
              .map((r) => regionById(r).label)
              .join('、')}），${region.label}各渠道在整段播出时间内都无法选材。`,
          });
        }
        continue;
      }

      for (const channel of CHANNELS) {
        const wins = segWins.filter((w) => w.region === region.id && w.channel === channel.id);
        if (wins.length === 0) continue;

        // 重叠：同一素材的任意两个窗口时间相交（首尾相接不算）
        const byAsset = new Map<string, RightsWindow[]>();
        for (const w of wins) {
          const arr = byAsset.get(w.assetId) ?? [];
          arr.push(w);
          byAsset.set(w.assetId, arr);
        }
        for (const [assetId, ws] of [...byAsset.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const sorted = [...ws].sort(
            (a, b) =>
              Date.parse(a.startUtc) - Date.parse(b.startUtc) ||
              Date.parse(a.endUtc) - Date.parse(b.endUtc) ||
              a.id.localeCompare(b.id),
          );
          for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
              const A = sorted[i];
              const B = sorted[j];
              const s = Math.max(Date.parse(A.startUtc), Date.parse(B.startUtc));
              const e = Math.min(Date.parse(A.endUtc), Date.parse(B.endUtc));
              if (s < e) {
                const winner = pickWinner([A, B]);
                out.push({
                  id: `overlap|${seg.id}|${region.id}|${channel.id}|${A.id}+${B.id}|${s}`,
                  type: 'overlap',
                  segmentId: seg.id,
                  region: region.id,
                  channel: channel.id,
                  assetIds: [assetId],
                  windowIds: [A.id, B.id],
                  span: { startMs: s, endMs: e },
                  message: `「${assetName(assetId)}」的 ${winName(A)}（优先级 ${A.priority}）与 ${winName(B)}（优先级 ${B.priority}）在 ${formatLocal(s, region.iana)} → ${formatLocal(e, region.iana)} 同时生效。演练时按「优先级高 → 开始早 → ID 字典序」选定 ${winName(winner)}。`,
                });
              }
            }
          }
        }

        // 空档：播出时段内，替代链上（仍存在的）素材的窗口并集未覆盖的部分
        const chainOk = new Set(seg.chain.filter((id) => assetById.has(id)));
        const intervals = wins
          .filter((w) => chainOk.has(w.assetId))
          .map((w) => [Date.parse(w.startUtc), Date.parse(w.endUtc)] as [number, number]);
        for (const [gs, ge] of computeGaps(intervals, segStart, segEnd)) {
          out.push({
            id: `gap|${seg.id}|${region.id}|${channel.id}|${gs}`,
            type: 'gap',
            segmentId: seg.id,
            region: region.id,
            channel: channel.id,
            assetIds: [],
            windowIds: [],
            span: { startMs: gs, endMs: ge },
            message: `${region.label}·${channelById(channel.id).label} 在 ${formatLocal(gs, region.iana)} → ${formatLocal(ge, region.iana)}（${fmtDuration(ge - gs)}）没有任何链上素材的授权覆盖，演练到此时段将落入空档。`,
          });
        }
      }
    }
  }

  // 确定性排序：段落顺序 → 类型 → 起始时刻 → id
  const segOrder = new Map(doc.segments.map((s, i) => [s.id, i]));
  out.sort(
    (a, b) =>
      (segOrder.get(a.segmentId) ?? 0) - (segOrder.get(b.segmentId) ?? 0) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      (a.span?.startMs ?? 0) - (b.span?.startMs ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return out;
}
