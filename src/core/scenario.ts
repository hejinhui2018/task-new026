import type { ScenarioState } from './types';

/**
 * 内置案例：品牌新品直播
 * - 上海 / 新加坡 / 伦敦三地同一直播段落，各地当地晚间黄金档
 * - 替代链：品牌主片 → 区域版（含本地解说/贴片）→ 安全垫片
 * - 伦敦主片仅授权官网直播渠道，OTT 大屏直接落到区域版
 * 全部时间用带偏移 ISO 表示绝对时刻。
 */

export const REGIONS = [
  { id: 'sha', name: '上海', timeZone: 'Asia/Shanghai' },
  { id: 'sin', name: '新加坡', timeZone: 'Asia/Singapore' },
  { id: 'lon', name: '伦敦', timeZone: 'Europe/London' },
] as const;

export const CHANNELS = [
  { id: 'web', name: '官网直播' },
  { id: 'ott', name: 'OTT 大屏' },
] as const;

export const MATERIALS = [
  { id: 'm_main', name: '品牌主片《全球发布》', kind: 'main' as const },
  { id: 'm_sha', name: '上海区域版（中文解说）', kind: 'regional' as const, ownerRegionId: 'sha' },
  { id: 'm_sin', name: '新加坡区域版（中英双语）', kind: 'regional' as const, ownerRegionId: 'sin' },
  { id: 'm_lon', name: '伦敦区域版（英文解说）', kind: 'regional' as const, ownerRegionId: 'lon' },
  { id: 'm_slate', name: '安全垫片（品牌循环片）', kind: 'slate' as const },
] as const;

/** 初始（健康）编排 */
export function createInitialScenario(): ScenarioState {
  return {
    name: '品牌新品直播 · 2026-09-18',
    regions: REGIONS.map((r) => ({ ...r })),
    channels: CHANNELS.map((c) => ({ ...c })),
    materials: MATERIALS.map((m) => ({ ...m })),
    span: { start: '2026-09-18T11:00:00Z', end: '2026-09-18T21:00:00Z' },
    windows: [
      // ---- 主片：各地晚间档前半段 ----
      {
        id: 'w_main_sha',
        materialId: 'm_main',
        regionId: 'sha',
        channelIds: [],
        start: '2026-09-18T19:30:00+08:00',
        end: '2026-09-18T21:00:00+08:00',
        label: '主片·上海（全渠道）',
      },
      {
        id: 'w_main_sin',
        materialId: 'm_main',
        regionId: 'sin',
        channelIds: [],
        start: '2026-09-18T19:30:00+08:00',
        end: '2026-09-18T20:45:00+08:00',
        label: '主片·新加坡（全渠道）',
      },
      {
        id: 'w_main_lon_web',
        materialId: 'm_main',
        regionId: 'lon',
        channelIds: ['web'],
        start: '2026-09-18T18:30:00+01:00',
        end: '2026-09-18T20:30:00+01:00',
        label: '主片·伦敦（仅官网）',
      },
      // ---- 区域版：主片到期后接力 ----
      {
        id: 'w_reg_sha',
        materialId: 'm_sha',
        regionId: 'sha',
        channelIds: [],
        start: '2026-09-18T21:00:00+08:00',
        end: '2026-09-18T22:00:00+08:00',
        label: '区域版·上海',
      },
      {
        id: 'w_reg_sin',
        materialId: 'm_sin',
        regionId: 'sin',
        channelIds: [],
        start: '2026-09-18T20:45:00+08:00',
        end: '2026-09-18T22:00:00+08:00',
        label: '区域版·新加坡',
      },
      {
        id: 'w_reg_lon',
        materialId: 'm_lon',
        regionId: 'lon',
        channelIds: [],
        start: '2026-09-18T19:00:00+01:00',
        end: '2026-09-18T21:00:00+01:00',
        label: '区域版·伦敦（全渠道）',
      },
      // ---- 安全垫片：各地全天兜底 ----
      {
        id: 'w_slate_sha',
        materialId: 'm_slate',
        regionId: 'sha',
        channelIds: [],
        start: '2026-09-18T18:00:00+08:00',
        end: '2026-09-18T23:00:00+08:00',
        label: '垫片·上海',
      },
      {
        id: 'w_slate_sin',
        materialId: 'm_slate',
        regionId: 'sin',
        channelIds: [],
        start: '2026-09-18T18:00:00+08:00',
        end: '2026-09-18T23:00:00+08:00',
        label: '垫片·新加坡',
      },
      {
        id: 'w_slate_lon',
        materialId: 'm_slate',
        regionId: 'lon',
        channelIds: [],
        start: '2026-09-18T17:00:00+01:00',
        end: '2026-09-18T22:00:00+01:00',
        label: '垫片·伦敦',
      },
    ],
    segments: [
      {
        id: 'seg_live',
        name: '品牌直播正片',
        scheduleByRegion: {
          sha: {
            start: '2026-09-18T20:00:00+08:00',
            end: '2026-09-18T22:00:00+08:00',
            chain: ['m_main', 'm_sha', 'm_slate'],
          },
          sin: {
            start: '2026-09-18T20:00:00+08:00',
            end: '2026-09-18T22:00:00+08:00',
            chain: ['m_main', 'm_sin', 'm_slate'],
          },
          lon: {
            start: '2026-09-18T19:00:00+01:00',
            end: '2026-09-18T21:00:00+01:00',
            chain: ['m_main', 'm_lon', 'm_slate'],
          },
        },
      },
    ],
  };
}

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  build: () => ScenarioState;
}

/** 演练情景预设（在健康编排上注入典型事故） */
export const PRESETS: ScenarioPreset[] = [
  {
    id: 'preset_revoke',
    name: '临时撤权',
    description: '上海主片被提前 30 分钟撤权，区域版尚未开始 → 暂时降级垫片',
    build: () => {
      const s = createInitialScenario();
      const w = s.windows.find((x) => x.id === 'w_main_sha')!;
      w.end = '2026-09-18T20:30:00+08:00';
      return s;
    },
  },
  {
    id: 'preset_overlap',
    name: '窗口重叠',
    description: '上海主片补发的临时授权与原窗口重叠，需要确定性裁决',
    build: () => {
      const s = createInitialScenario();
      s.windows.push({
        id: 'w_main_sha_temp',
        materialId: 'm_main',
        regionId: 'sha',
        channelIds: [],
        start: '2026-09-18T20:30:00+08:00',
        end: '2026-09-18T21:30:00+08:00',
        label: '主片·上海（临时补发）',
      });
      return s;
    },
  },
  {
    id: 'preset_broken',
    name: '替代链断裂',
    description: '上海链中引用了一份已删除的区域精编版素材',
    build: () => {
      const s = createInitialScenario();
      s.segments[0].scheduleByRegion.sha.chain = [
        'm_main',
        'm_sha_cut',
        'm_slate',
      ];
      return s;
    },
  },
  {
    id: 'preset_cycle',
    name: '替代链循环',
    description: '上海链在主片失效后回到主片形成循环；21:00 后主片到期、区域版又无窗口，将黑屏',
    build: () => {
      const s = createInitialScenario();
      s.segments[0].scheduleByRegion.sha.chain = ['m_main', 'm_sha', 'm_main'];
      // 区域版窗口缺失，循环才会真正走到
      s.windows = s.windows.filter((x) => x.id !== 'w_reg_sha');
      return s;
    },
  },
];

export function deepCloneScenario(s: ScenarioState): ScenarioState {
  return JSON.parse(JSON.stringify(s)) as ScenarioState;
}
