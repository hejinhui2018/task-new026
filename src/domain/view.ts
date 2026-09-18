/** 视图辅助：时间轴可视范围与"关键时刻"（窗口边界、播出边界、冲突边界）。 */
import type { ChannelId, Doc, RegionId } from './types';
import { detectConflicts } from './conflicts';

export interface ViewRange {
  startMs: number;
  endMs: number;
}

/** 覆盖全部段落与窗口的时间范围，两端各留 5 分钟余量并对齐到 5 分钟。 */
export function getViewRange(doc: Doc): ViewRange {
  const times: number[] = [];
  for (const s of doc.segments) {
    times.push(Date.parse(s.startUtc), Date.parse(s.endUtc));
  }
  for (const w of doc.windows) {
    times.push(Date.parse(w.startUtc), Date.parse(w.endUtc));
  }
  const step = 5 * 60_000;
  if (times.length === 0) {
    const base = Date.parse('2026-09-20T12:00:00Z');
    return { startMs: base - 3_600_000, endMs: base + 3_600_000 };
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  return {
    startMs: Math.floor((min - step) / step) * step,
    endMs: Math.ceil((max + step) / step) * step,
  };
}

/** 当前（段落, 地区, 渠道）下所有值得停靠的时刻，升序去重。 */
export function getKeyMoments(doc: Doc, segmentId: string, region: RegionId, channel: ChannelId): number[] {
  const set = new Set<number>();
  const seg = doc.segments.find((s) => s.id === segmentId);
  if (seg) {
    set.add(Date.parse(seg.startUtc));
    set.add(Date.parse(seg.endUtc));
  }
  for (const w of doc.windows) {
    if (w.segmentId === segmentId && w.region === region && w.channel === channel) {
      set.add(Date.parse(w.startUtc));
      set.add(Date.parse(w.endUtc));
    }
  }
  for (const c of detectConflicts(doc)) {
    if (c.segmentId === segmentId && c.span && (!c.region || c.region === region) && (!c.channel || c.channel === channel)) {
      set.add(c.span.startMs);
      set.add(c.span.endMs);
    }
  }
  return [...set].sort((a, b) => a - b);
}
