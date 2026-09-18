/**
 * 内置案例：Aurora 品牌全球直播（2026-09-20，12:00–13:00 UTC）。
 * 上海 / 新加坡 20:00–21:00（UTC+8），伦敦 13:00–14:00（BST，UTC+1）。
 *
 * 案例刻意包含三类典型问题，供演练台演示：
 *  1. 授权重叠 —— 主直播上海 OTT 的"基础授权"与"临时延授"在 12:20–12:35 同时生效；
 *  2. 授权空档 —— 栏目片段上海 OTT 主片 12:55 提前失效，且替代链未挂安全垫片；
 *  3. 地区不匹配 —— 广告时段在伦敦完全未授权。
 * 以及常规替换路径：主片 → 区域版（亚太/欧洲）→ 安全垫片。
 */
import type { ChannelId, Doc, RegionId, RightsWindow } from './types';

const DAY = '2026-09-20';
const u = (hhmm: string): string => `${DAY}T${hhmm}:00.000Z`;

export function seedDoc(): Doc {
  const windows: RightsWindow[] = [];
  const add = (
    segmentId: string,
    assetId: string,
    region: RegionId,
    channel: ChannelId,
    start: string,
    end: string,
    priority = 1,
    note?: string,
  ): void => {
    windows.push({
      id: `w-${windows.length + 1}`,
      segmentId,
      assetId,
      region,
      channel,
      startUtc: u(start),
      endUtc: u(end),
      priority,
      ...(note ? { note } : {}),
    });
  };

  // ---- 开场片 11:55–12:05 UTC：主片全球授权，区域版与垫片做备份 ----
  for (const ch of ['tv', 'ott'] as const) {
    add('seg-open', 'ast-main', 'shanghai', ch, '11:30', '12:30');
    add('seg-open', 'ast-main', 'singapore', ch, '11:30', '12:30');
    add('seg-open', 'ast-main', 'london', ch, '11:30', '12:30');
    add('seg-open', 'ast-apac', 'shanghai', ch, '11:30', '13:00');
    add('seg-open', 'ast-apac', 'singapore', ch, '11:30', '13:00');
    add('seg-open', 'ast-emea', 'london', ch, '11:30', '13:00');
    add('seg-open', 'ast-pad', 'shanghai', ch, '11:30', '13:30');
    add('seg-open', 'ast-pad', 'singapore', ch, '11:30', '13:30');
    add('seg-open', 'ast-pad', 'london', ch, '11:30', '13:30');
  }

  // ---- 主直播 12:05–12:40 UTC ----
  // 上海 OTT：两份主片授权重叠（12:20–12:35），演练时按优先级选"临时延授"
  add('seg-live', 'ast-main', 'shanghai', 'ott', '12:00', '12:35', 1, '基础授权');
  add('seg-live', 'ast-main', 'shanghai', 'ott', '12:20', '12:45', 2, '临时延授');
  add('seg-live', 'ast-main', 'shanghai', 'tv', '12:00', '12:45');
  // 新加坡 OTT：主片 12:25 提前失效，之后落到亚太区域版
  add('seg-live', 'ast-main', 'singapore', 'ott', '12:00', '12:25', 1, '新加坡 OTT 授权（提前结束）');
  add('seg-live', 'ast-main', 'singapore', 'tv', '12:00', '12:45');
  // 伦敦 OTT：主片未授权（仅电视有），走欧洲区域版
  add('seg-live', 'ast-main', 'london', 'tv', '12:00', '12:45');
  for (const ch of ['tv', 'ott'] as const) {
    add('seg-live', 'ast-apac', 'shanghai', ch, '12:00', '13:00');
    add('seg-live', 'ast-apac', 'singapore', ch, '12:00', '13:00');
    add('seg-live', 'ast-emea', 'london', ch, '12:00', '13:00');
    add('seg-live', 'ast-pad', 'shanghai', ch, '12:00', '13:30');
    add('seg-live', 'ast-pad', 'singapore', ch, '12:00', '13:30');
    add('seg-live', 'ast-pad', 'london', ch, '12:00', '13:30');
  }

  // ---- 品牌广告时段 12:40–12:50 UTC：伦敦完全未授权（地区不匹配） ----
  for (const ch of ['tv', 'ott', 'social'] as const) {
    add('seg-ad', 'ast-ad-global', 'singapore', ch, '12:00', '13:00');
    add('seg-ad', 'ast-ad-cn', 'shanghai', ch, '12:00', '13:00');
    add('seg-ad', 'ast-pad', 'shanghai', ch, '12:00', '13:30');
    add('seg-ad', 'ast-pad', 'singapore', ch, '12:00', '13:30');
  }

  // ---- 栏目片段 12:50–13:00 UTC：上海 OTT 主片 12:55 提前结束，链上无垫片 → 空档 ----
  add('seg-column', 'ast-main', 'shanghai', 'ott', '12:00', '12:55', 1, '上海 OTT 授权（提前 5 分钟结束）');
  add('seg-column', 'ast-main', 'shanghai', 'social', '12:00', '13:00');
  add('seg-column', 'ast-main', 'singapore', 'ott', '12:00', '13:00');
  add('seg-column', 'ast-main', 'singapore', 'social', '12:00', '13:00');
  add('seg-column', 'ast-emea', 'london', 'ott', '12:00', '13:00');

  return {
    version: 1,
    title: 'Aurora 品牌全球直播 · 2026-09-20',
    assets: [
      { id: 'ast-main', name: '主片 · 全球母版', kind: 'main', note: '需按地区/渠道逐一授权' },
      { id: 'ast-apac', name: '区域版 · 亚太', kind: 'regional' },
      { id: 'ast-emea', name: '区域版 · 欧洲', kind: 'regional' },
      { id: 'ast-pad', name: '安全垫片 · 品牌静帧', kind: 'safety', note: '兜底素材，授权通常最宽' },
      { id: 'ast-ad-global', name: '广告包 · 全球版', kind: 'ad' },
      { id: 'ast-ad-cn', name: '广告包 · 中国区', kind: 'ad' },
    ],
    segments: [
      { id: 'seg-open', name: '开场片《Aurora 序章》', startUtc: u('11:55'), endUtc: u('12:05'), chain: ['ast-main', 'ast-apac', 'ast-emea', 'ast-pad'] },
      { id: 'seg-live', name: '品牌主直播', startUtc: u('12:05'), endUtc: u('12:40'), chain: ['ast-main', 'ast-apac', 'ast-emea', 'ast-pad'] },
      { id: 'seg-ad', name: '品牌广告时段', startUtc: u('12:40'), endUtc: u('12:50'), chain: ['ast-ad-global', 'ast-ad-cn', 'ast-pad'] },
      // 刻意不挂安全垫片：演示空档与"链上缺兜底"的修复过程
      { id: 'seg-column', name: '栏目片段《幕后纪事》', startUtc: u('12:50'), endUtc: u('13:00'), chain: ['ast-main', 'ast-emea'] },
    ],
    windows,
  };
}
