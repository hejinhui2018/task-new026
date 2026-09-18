/** 把解析结果翻译成可读的路径解释（为什么跳过、为什么选中）。 */
import type { ChannelId, Doc, RegionId } from './types';
import { channelById, regionById } from './types';
import type { ResolveStep } from './resolve';
import { formatLocal, fmtDuration } from './time';

export function stepTitle(step: ResolveStep, doc: Doc): string {
  const asset = doc.assets.find((a) => a.id === step.assetId);
  return asset ? asset.name : `未知素材（${step.assetId}）`;
}

export function stepDetail(step: ResolveStep, region: RegionId, channel: ChannelId): string {
  const iana = regionById(region).iana;
  const regionLabel = regionById(region).label;
  const channelLabel = channelById(channel).label;

  if (step.outcome === 'selected' && step.hit) {
    const w = step.hit.window;
    const base = `命中窗口「${w.note ?? w.id}」：${formatLocal(Date.parse(w.startUtc), iana)} → ${formatLocal(
      Date.parse(w.endUtc),
      iana,
    )}（${regionLabel}本地），优先级 ${w.priority}`;
    const others = step.hit.contenders.filter((c) => c.id !== w.id);
    if (others.length === 0) return base;
    return `${base}；另有 ${others.length} 个窗口同时生效（${others
      .map((o) => `「${o.note ?? o.id}」优先级 ${o.priority}`)
      .join('、')}），按「优先级高 → 开始早 → ID 字典序」规则选定前者`;
  }

  const r = step.reason;
  if (!r) return '';
  switch (r.kind) {
    case 'missing-asset':
      return '该素材已从素材库删除，替代链在此处断裂，继续向下评估';
    case 'cycle':
      return '该素材在替代链中已出现过，继续评估将形成循环，演练在此停止';
    case 'no-window': {
      const where =
        r.elsewhere.length > 0
          ? `；该素材在此段落仅授权了 ${r.elsewhere
              .map((e) => `${regionById(e.region).label}·${channelById(e.channel).label}`)
              .join('、')}`
          : '；该素材在此段落没有任何授权窗口';
      return `在 ${regionLabel}·${channelLabel} 没有匹配授权（地区/渠道不匹配）${where}`;
    }
    case 'outside': {
      const w = r.nearest;
      const when =
        r.position === 'after'
          ? `最近的窗口已于 ${formatLocal(Date.parse(w.endUtc), iana)} 结束（${fmtDuration(r.distanceMs)}前）`
          : `最近的窗口要到 ${formatLocal(Date.parse(w.startUtc), iana)} 才生效（${fmtDuration(r.distanceMs)}后）`;
      return `授权窗口未覆盖当前时刻：${when}（${regionLabel}本地）`;
    }
  }
}
