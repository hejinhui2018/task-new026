/** 领域模型：节目段落、素材、授权窗口与替代链。 */

export type RegionId = 'shanghai' | 'singapore' | 'london';
export type ChannelId = 'tv' | 'ott' | 'social';
export type AssetKind = 'main' | 'regional' | 'safety' | 'ad';

export interface RegionDef {
  id: RegionId;
  label: string;
  /** IANA 时区名，用于当地时间换算 */
  iana: string;
}

export interface ChannelDef {
  id: ChannelId;
  label: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'shanghai', label: '上海', iana: 'Asia/Shanghai' },
  { id: 'singapore', label: '新加坡', iana: 'Asia/Singapore' },
  { id: 'london', label: '伦敦', iana: 'Europe/London' },
];

export const CHANNELS: ChannelDef[] = [
  { id: 'tv', label: '电视' },
  { id: 'ott', label: 'OTT 流媒体' },
  { id: 'social', label: '社交短视频' },
];

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  main: '主片',
  regional: '区域版',
  safety: '安全垫片',
  ad: '广告',
};

export function regionById(id: RegionId): RegionDef {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`未知地区: ${id}`);
  return r;
}

export function channelById(id: ChannelId): ChannelDef {
  const c = CHANNELS.find((x) => x.id === id);
  if (!c) throw new Error(`未知渠道: ${id}`);
  return c;
}

/** 一份可投放的素材（主片 / 区域版 / 安全垫片 / 广告包）。 */
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  note?: string;
}

/** 节目段落：播出骨架上的一段，带自己的替代素材链（有序，前者优先）。 */
export interface Segment {
  id: string;
  name: string;
  /** 播出开始（UTC ISO，含） */
  startUtc: string;
  /** 播出结束（UTC ISO，不含） */
  endUtc: string;
  /** 替代链：素材 id 有序列表，如 [主片, 区域版, 安全垫片] */
  chain: string[];
}

/** 授权窗口：某素材在某段落、某地区、某渠道的一段时间使用权，半开区间 [start, end)。 */
export interface RightsWindow {
  id: string;
  segmentId: string;
  assetId: string;
  region: RegionId;
  channel: ChannelId;
  /** 生效时刻（UTC ISO，含） */
  startUtc: string;
  /** 失效时刻（UTC ISO，不含） */
  endUtc: string;
  /** 同一时刻多个窗口重叠时，优先级高者胜出 */
  priority: number;
  note?: string;
}

/** 一份编排方案（草稿）。 */
export interface Doc {
  version: 1;
  title: string;
  assets: Asset[];
  segments: Segment[];
  windows: RightsWindow[];
}

/** 情景快照：命名保存的整份方案。 */
export interface Snapshot {
  id: string;
  name: string;
  savedAt: string;
  doc: Doc;
}
