import { describe, expect, it } from 'vitest';
import type { Asset, Doc, RightsWindow } from '../types';
import { resolveAt } from '../resolve';
import { seedDoc } from '../seed';

const T = (hhmm: string): number => Date.parse(`2026-09-20T${hhmm}:00Z`);

function mkWindow(id: string, assetId: string, start: string, end: string, priority = 1): RightsWindow {
  return {
    id,
    segmentId: 's1',
    assetId,
    region: 'shanghai',
    channel: 'ott',
    startUtc: `2026-09-20T${start}:00Z`,
    endUtc: `2026-09-20T${end}:00Z`,
    priority,
  };
}

const ASSETS: Asset[] = [
  { id: 'a', name: 'A 主片', kind: 'main' },
  { id: 'b', name: 'B 区域版', kind: 'regional' },
  { id: 'c', name: 'C 垫片', kind: 'safety' },
];

function mkDoc(chain: string[], windows: RightsWindow[], assets: Asset[] = ASSETS): Doc {
  return {
    version: 1,
    title: 'test',
    segments: [
      { id: 's1', name: 'S1', startUtc: '2026-09-20T12:00:00Z', endUtc: '2026-09-20T13:00:00Z', chain },
    ],
    assets,
    windows,
  };
}

describe('时间边界：半开区间 [开始, 结束)', () => {
  const doc = mkDoc(['a'], [mkWindow('w1', 'a', '12:00', '12:30')]);

  it('生效前 1 秒：未覆盖，提示"将于…生效"', () => {
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:00') - 1000);
    expect(r.gap).toBe(true);
    expect(r.steps[0].reason).toMatchObject({ kind: 'outside', position: 'before', distanceMs: 1000 });
  });

  it('开始时刻立即生效（闭区间）', () => {
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:00'));
    expect(r.selectedAssetId).toBe('a');
    expect(r.selectedWindow?.id).toBe('w1');
  });

  it('结束前 1 秒仍生效，结束时刻立即失效（开区间）', () => {
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:30') - 1000).selectedAssetId).toBe('a');
    const at = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:30'));
    expect(at.gap).toBe(true);
    expect(at.steps[0].reason).toMatchObject({ kind: 'outside', position: 'after', distanceMs: 0 });
  });
});

describe('替代链顺序与跳过原因', () => {
  const doc = mkDoc(
    ['a', 'b', 'c'],
    [mkWindow('w1', 'a', '12:00', '12:30'), mkWindow('w2', 'b', '12:00', '13:00'), mkWindow('w3', 'c', '12:00', '13:00')],
  );

  it('主片有效时用主片', () => {
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15')).selectedAssetId).toBe('a');
  });

  it('主片失效后落到区域版，路径记录跳过原因', () => {
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:45'));
    expect(r.selectedAssetId).toBe('b');
    expect(r.steps.map((s) => s.outcome)).toEqual(['skipped', 'selected']);
    expect(r.steps[0].reason?.kind).toBe('outside');
  });

  it('地区/渠道不匹配时给出该素材实际授权的位置', () => {
    const aLondon: RightsWindow = { ...mkWindow('w9', 'a', '12:00', '13:00'), region: 'london' };
    const d = mkDoc(['a', 'b'], [aLondon, mkWindow('w1', 'b', '12:00', '13:00')]);
    const r = resolveAt(d, 's1', 'shanghai', 'ott', T('12:15'));
    expect(r.selectedAssetId).toBe('b');
    expect(r.steps[0].reason).toMatchObject({
      kind: 'no-window',
      elsewhere: [{ region: 'london', channel: 'ott' }],
    });
  });

  it('链全部走完仍无覆盖 → 空档', () => {
    const d = mkDoc(['a', 'b'], [mkWindow('w1', 'a', '12:00', '12:10')]);
    const r = resolveAt(d, 's1', 'shanghai', 'ott', T('12:30'));
    expect(r.gap).toBe(true);
    expect(r.selectedAssetId).toBeNull();
  });
});

describe('授权重叠：决胜规则与确定性', () => {
  const windows = [mkWindow('w1', 'a', '12:00', '12:30', 1), mkWindow('w2', 'a', '12:10', '12:40', 2)];

  it('重叠区优先级高者胜出，非重叠区各归各', () => {
    const doc = mkDoc(['a'], windows);
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15')).selectedWindow?.id).toBe('w2');
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:05')).selectedWindow?.id).toBe('w1');
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:35')).selectedWindow?.id).toBe('w2');
  });

  it('同优先级重叠取开始更早者', () => {
    const doc = mkDoc(['a'], [mkWindow('w1', 'a', '12:00', '12:30'), mkWindow('w2', 'a', '12:10', '12:40')]);
    expect(resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15')).selectedWindow?.id).toBe('w1');
  });

  it('重叠时 contenders 记录全部生效窗口', () => {
    const doc = mkDoc(['a'], windows);
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15'));
    expect(r.steps[0].hit?.contenders.map((w) => w.id)).toEqual(['w2', 'w1']);
  });

  it('窗口数组顺序打乱后结果完全一致', () => {
    const at = T('12:15');
    const r1 = resolveAt(mkDoc(['a', 'b'], windows), 's1', 'shanghai', 'ott', at);
    const r2 = resolveAt(mkDoc(['a', 'b'], [...windows].reverse()), 's1', 'shanghai', 'ott', at);
    expect(r1).toEqual(r2);
  });
});

describe('替代链断裂与循环', () => {
  it('引用不存在的素材：标记断裂并继续向下评估', () => {
    const doc = mkDoc(['ghost', 'b'], [mkWindow('w1', 'b', '12:00', '13:00')]);
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15'));
    expect(r.steps[0]).toMatchObject({ assetId: 'ghost', outcome: 'broken' });
    expect(r.selectedAssetId).toBe('b');
  });

  it('素材在链中重复：判定循环并停止', () => {
    const doc = mkDoc(['a', 'b', 'a'], []);
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15'));
    expect(r.steps.map((s) => s.outcome)).toEqual(['skipped', 'skipped', 'cycle']);
    expect(r.gap).toBe(true);
  });

  it('循环发生前已命中则不受影响', () => {
    const doc = mkDoc(['a', 'a'], [mkWindow('w1', 'a', '12:00', '13:00')]);
    const r = resolveAt(doc, 's1', 'shanghai', 'ott', T('12:15'));
    expect(r.selectedAssetId).toBe('a');
    expect(r.steps).toHaveLength(1);
  });
});

describe('内置直播案例：跨上海 / 新加坡 / 伦敦的选材', () => {
  const doc = seedDoc();

  it('上海 OTT 主直播：重叠区按"临时延授"（优先级 2）选材', () => {
    expect(resolveAt(doc, 'seg-live', 'shanghai', 'ott', T('12:10')).selectedWindow?.note).toBe('基础授权');
    expect(resolveAt(doc, 'seg-live', 'shanghai', 'ott', T('12:30')).selectedWindow?.note).toBe('临时延授');
    expect(resolveAt(doc, 'seg-live', 'shanghai', 'ott', T('12:44')).selectedWindow?.note).toBe('临时延授');
  });

  it('上海 OTT 主直播：主片全部失效后落到亚太区域版', () => {
    const r = resolveAt(doc, 'seg-live', 'shanghai', 'ott', T('12:46'));
    expect(r.selectedAssetId).toBe('ast-apac');
    expect(r.steps[0].reason?.kind).toBe('outside');
  });

  it('新加坡 OTT：主片 12:25 失效，12:26 起落到亚太区域版', () => {
    expect(resolveAt(doc, 'seg-live', 'singapore', 'ott', T('12:24')).selectedAssetId).toBe('ast-main');
    expect(resolveAt(doc, 'seg-live', 'singapore', 'ott', T('12:26')).selectedAssetId).toBe('ast-apac');
  });

  it('伦敦 OTT：主片未授权，经亚太（也不匹配）落到欧洲区域版', () => {
    const r = resolveAt(doc, 'seg-live', 'london', 'ott', T('12:15'));
    expect(r.selectedAssetId).toBe('ast-emea');
    expect(r.steps[0].reason?.kind).toBe('no-window');
    expect(r.steps[1].reason?.kind).toBe('no-window');
  });

  it('上海 OTT 栏目片段：12:55 主片失效且链上无垫片 → 空档', () => {
    expect(resolveAt(doc, 'seg-column', 'shanghai', 'ott', T('12:54')).selectedAssetId).toBe('ast-main');
    const r = resolveAt(doc, 'seg-column', 'shanghai', 'ott', T('12:57'));
    expect(r.gap).toBe(true);
  });

  it('上海 OTT 广告时段：全球版未授权，落到中国区广告包', () => {
    expect(resolveAt(doc, 'seg-ad', 'shanghai', 'ott', T('12:45')).selectedAssetId).toBe('ast-ad-cn');
  });

  it('伦敦广告时段：整段空档（地区不匹配）', () => {
    expect(resolveAt(doc, 'seg-ad', 'london', 'ott', T('12:45')).gap).toBe(true);
  });

  it('同一输入重复演练结果一致（含重新生成的种子）', () => {
    const at = T('12:30');
    expect(resolveAt(doc, 'seg-live', 'shanghai', 'ott', at)).toEqual(
      resolveAt(seedDoc(), 'seg-live', 'shanghai', 'ott', at),
    );
  });
});
