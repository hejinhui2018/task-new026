/** 核心领域模型 —— 全部为可序列化的纯数据，便于持久化与快照 */

export interface Region {
  id: string;
  /** 显示名，如“上海” */
  name: string;
  /** IANA 时区，如 Asia/Shanghai */
  timeZone: string;
}

export interface Channel {
  id: string;
  name: string;
}

export type MaterialKind = 'main' | 'regional' | 'slate';

export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  /** 区域版素材所属地区；主片与垫片为 undefined（全球/通用） */
  ownerRegionId?: string;
}

/**
 * 授权窗口。时间一律使用“带偏移的 ISO-8601 字符串”存储绝对时刻，
 * 例如 2026-09-18T20:00:00+08:00，避免歧义。
 * 半开区间语义：[start, end) —— start 瞬间已生效，end 瞬间已失效。
 * start/end 为 null 表示不限。
 */
export interface RightsWindow {
  id: string;
  materialId: string;
  /** 授权地区 */
  regionId: string;
  /** 授权渠道；空数组表示全部渠道 */
  channelIds: string[];
  start: string | null;
  end: string | null;
  label?: string;
}

/** 某地区在某时段的播出安排与替代链（按优先级排序的素材 id） */
export interface SegmentSchedule {
  start: string;
  end: string;
  chain: string[];
}

export interface Segment {
  id: string;
  name: string;
  /** key 为 regionId */
  scheduleByRegion: Record<string, SegmentSchedule>;
}

export interface ScenarioState {
  name: string;
  regions: Region[];
  channels: Channel[];
  materials: Material[];
  windows: RightsWindow[];
  segments: Segment[];
  /** 演练时钟可拖动的总范围 */
  span: { start: string; end: string };
}

export type IssueKind =
  | 'overlap'
  | 'gap'
  | 'region-mismatch'
  | 'broken-chain'
  | 'cycle'
  | 'unlicensed';

export interface Issue {
  kind: IssueKind;
  severity: 'error' | 'warning';
  segmentId?: string;
  regionId?: string;
  channelId?: string;
  materialIds?: string[];
  windowIds?: string[];
  /** 问题对应的时间区间（毫秒），不设限端省略 */
  startMs?: number;
  endMs?: number;
}

export type StepStatus =
  | 'selected'
  | 'selected-overlap'
  | 'outside'
  | 'wrong-region'
  | 'wrong-channel'
  | 'missing'
  | 'unlicensed'
  | 'slate'
  | 'cycle';

export interface ChainStep {
  index: number;
  materialId: string;
  status: StepStatus;
  /** selected / selected-overlap 时命中的窗口 */
  windowId?: string;
  /** 当前时刻本地区+渠道同时有效的窗口（重叠时多于一个） */
  activeWindowIds?: string[];
  /** 本地区存在、但渠道不匹配的窗口 */
  blockedChannelWindowIds?: string[];
  /** 素材仅在这些地区有授权（wrong-region 时） */
  otherRegions?: string[];
  /** 解释“未生效/已失效”用的最近边界 */
  nextStartMs?: number;
  lastEndMs?: number;
}

export interface Evaluation {
  atMs: number;
  regionId: string;
  channelId: string;
  steps: ChainStep[];
  selectedMaterialId: string | null;
  selectedWindowId: string | null;
  /** 替代链走完仍无素材 → 黑屏 */
  blackout: boolean;
  /** 此刻是否落在该地区段落的播出时段 [schedule.start, schedule.end) 内 */
  onAir: boolean;
}
