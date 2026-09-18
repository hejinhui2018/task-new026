import { describe, expect, it } from 'vitest';
import type { Doc } from '../types';
import { computeGaps, detectConflicts } from '../conflicts';
import { seedDoc } from '../seed';

const T = (hhmm: string): number => Date.parse(`2026-09-20T${hhmm}:00Z`);

describe('computeGaps：空档区间计算', () => {
  it('基本空档', () => {
    expect(
      computeGaps(
        [
          [0, 10],
          [20, 30],
        ],
        0,
        40,
      ),
    ).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  it('完全覆盖无空档', () => {
    expect(computeGaps([[0, 40]], 0, 40)).toEqual([]);
  });

  it('首尾相接（end === start）不算空档', () => {
    expect(
      computeGaps(
        [
          [0, 10],
          [10, 20],
        ],
        0,
        20,
      ),
    ).toEqual([]);
  });

  it('无任何覆盖 → 整段空档', () => {
    expect(computeGaps([], 0, 10)).toEqual([[0, 10]]);
  });

  it('超出播出时段的部分被裁剪', () => {
    expect(
      computeGaps(
        [
          [-100, 5],
          [35, 100],
        ],
        0,
        30,
      ),
    ).toEqual([[5, 30]]);
  });
});

describe('内置案例的冲突检出', () => {
  const conflicts = detectConflicts(seedDoc());

  it('检出一次授权重叠：上海 OTT 主直播 12:20–12:35', () => {
    const ov = conflicts.filter((c) => c.type === 'overlap');
    expect(ov).toHaveLength(1);
    expect(ov[0].segmentId).toBe('seg-live');
    expect(ov[0].span).toEqual({ startMs: T('12:20'), endMs: T('12:35') });
    expect(ov[0].windowIds).toHaveLength(2);
  });

  it('检出一次授权空档：上海 OTT 栏目片段 12:55–13:00', () => {
    const gaps = conflicts.filter((c) => c.type === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].segmentId).toBe('seg-column');
    expect(gaps[0].region).toBe('shanghai');
    expect(gaps[0].span).toEqual({ startMs: T('12:55'), endMs: T('13:00') });
  });

  it('检出一次地区不匹配：广告时段在伦敦无任何授权', () => {
    const rm = conflicts.filter((c) => c.type === 'region-mismatch');
    expect(rm).toHaveLength(1);
    expect(rm[0].segmentId).toBe('seg-ad');
    expect(rm[0].region).toBe('london');
  });

  it('冲突解释包含本地时间与决策规则', () => {
    const ov = conflicts.find((c) => c.type === 'overlap');
    expect(ov?.message).toContain('20:20:00'); // 上海本地时间（UTC+8）
    expect(ov?.message).toContain('优先级');
    expect(ov?.message).toContain('临时延授');
    const gap = conflicts.find((c) => c.type === 'gap');
    expect(gap?.message).toContain('20:55:00');
    expect(gap?.message).toContain('5 分钟');
  });

  it('确定性：打乱窗口顺序后冲突列表完全一致', () => {
    const doc = seedDoc();
    const shuffled: Doc = { ...doc, windows: [...doc.windows].reverse() };
    expect(detectConflicts(shuffled)).toEqual(conflicts);
  });
});

describe('断裂与循环检测', () => {
  const doc: Doc = {
    version: 1,
    title: 't',
    assets: [{ id: 'a', name: 'A', kind: 'main' }],
    segments: [
      {
        id: 's1',
        name: 'S1',
        startUtc: '2026-09-20T12:00:00Z',
        endUtc: '2026-09-20T13:00:00Z',
        chain: ['ghost', 'a', 'a'],
      },
    ],
    windows: [
      {
        id: 'w1',
        segmentId: 's1',
        assetId: 'a',
        region: 'shanghai',
        channel: 'ott',
        startUtc: '2026-09-20T12:00:00Z',
        endUtc: '2026-09-20T13:00:00Z',
        priority: 1,
      },
    ],
  };

  it('断裂与循环都被指出，且定位到受影响段落', () => {
    const types = detectConflicts(doc).map((c) => c.type);
    expect(types).toContain('broken-chain');
    expect(types).toContain('cycle');
    const broken = detectConflicts(doc).find((c) => c.type === 'broken-chain');
    expect(broken?.segmentId).toBe('s1');
    expect(broken?.assetIds).toEqual(['ghost']);
  });

  it('首尾相接的同素材窗口不算重叠', () => {
    const touching: Doc = {
      ...doc,
      segments: [{ ...doc.segments[0], chain: ['a'] }],
      windows: [
        { ...doc.windows[0], id: 'w1', endUtc: '2026-09-20T12:30:00Z' },
        { ...doc.windows[0], id: 'w2', startUtc: '2026-09-20T12:30:00Z' },
      ],
    };
    expect(detectConflicts(touching).filter((c) => c.type === 'overlap')).toHaveLength(0);
  });
});
