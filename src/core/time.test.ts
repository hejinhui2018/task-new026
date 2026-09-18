import { describe, expect, it } from 'vitest';
import {
  contains,
  formatLocal,
  localInputToIso,
  localPartsToMs,
  toIso,
  toLocalParts,
  toMs,
  tzAbbr,
  tzOffsetMs,
} from './time';

describe('半开区间 [start, end)', () => {
  const s = toMs('2026-09-18T19:30:00+08:00');
  const e = toMs('2026-09-18T21:00:00+08:00');

  it('开始瞬间已生效', () => {
    expect(contains(s, s, e)).toBe(true);
  });

  it('结束瞬间已失效（零点切换）', () => {
    expect(contains(e, s, e)).toBe(false);
  });

  it('结束前 1 毫秒仍有效', () => {
    expect(contains(e - 1, s, e)).toBe(true);
  });

  it('开始前 1 毫秒无效', () => {
    expect(contains(s - 1, s, e)).toBe(false);
  });

  it('null 端表示不限', () => {
    expect(contains(0, null, null)).toBe(true);
    expect(contains(Number.MAX_SAFE_INTEGER, s, null)).toBe(true);
    expect(contains(0, null, s)).toBe(true);
    expect(contains(s, null, s)).toBe(false);
  });
});

describe('ISO 绝对时刻解析', () => {
  it('不同写法的同一绝对时刻相等', () => {
    expect(toMs('2026-09-18T12:00:00Z')).toBe(
      toMs('2026-09-18T20:00:00+08:00'),
    );
    expect(toMs('2026-09-18T13:00:00+01:00')).toBe(
      toMs('2026-09-18T12:00:00Z'),
    );
  });

  it('非法字符串抛错', () => {
    expect(() => toMs('not-a-date')).toThrow();
  });

  it('toIso/toMs 往返', () => {
    expect(toMs(toIso(1_758_196_800_000))).toBe(1_758_196_800_000);
  });
});

describe('时区换算（上海 / 新加坡 / 伦敦）', () => {
  const t = toMs('2026-09-18T12:00:00Z'); // 9 月伦敦为 BST

  it('偏移正确', () => {
    expect(tzOffsetMs(t, 'Asia/Shanghai')).toBe(8 * 3_600_000);
    expect(tzOffsetMs(t, 'Asia/Singapore')).toBe(8 * 3_600_000);
    expect(tzOffsetMs(t, 'Europe/London')).toBe(1 * 3_600_000);
  });

  it('伦敦冬季为 GMT(+0)', () => {
    const winter = toMs('2026-01-15T12:00:00Z');
    expect(tzOffsetMs(winter, 'Europe/London')).toBe(0);
  });

  it('同一 UTC 时刻的当地墙钟', () => {
    expect(formatLocal(t, 'Asia/Shanghai')).toContain('2026-09-18 20:00:00');
    expect(formatLocal(t, 'Asia/Singapore')).toContain('2026-09-18 20:00:00');
    expect(formatLocal(t, 'Europe/London')).toContain('2026-09-18 13:00:00');
    expect(formatLocal(t, 'Europe/London')).toContain('UTC+01:00');
  });

  it('时区缩写', () => {
    expect(tzAbbr(t, 'Asia/Shanghai')).toMatch(/GMT\+8|\+08|CST/);
  });

  it('当地墙钟 → 绝对时刻', () => {
    expect(
      localPartsToMs(
        { year: 2026, month: 9, day: 18, hour: 20, minute: 0 },
        'Asia/Shanghai',
      ),
    ).toBe(t);
    expect(
      localPartsToMs(
        { year: 2026, month: 9, day: 18, hour: 13, minute: 0 },
        'Europe/London',
      ),
    ).toBe(t);
  });

  it('toLocalParts 往返一致', () => {
    for (const tz of ['Asia/Shanghai', 'Asia/Singapore', 'Europe/London']) {
      const p = toLocalParts(t, tz);
      expect(localPartsToMs(p, tz)).toBe(t);
    }
  });

  it('表单输入按所选地区时区解释', () => {
    expect(localInputToIso('2026-09-18T20:00', 'Asia/Shanghai')).toBe(
      '2026-09-18T12:00:00.000Z',
    );
    expect(localInputToIso('2026-09-18T13:00', 'Europe/London')).toBe(
      '2026-09-18T12:00:00.000Z',
    );
  });

  it('伦敦夏令时切换：秋季重叠时刻取较早瞬间（BST）', () => {
    // 2026-10-25 01:30 伦敦出现两次，较早的一次是 00:30Z
    expect(
      localPartsToMs(
        { year: 2026, month: 10, day: 25, hour: 1, minute: 30 },
        'Europe/London',
      ),
    ).toBe(toMs('2026-10-25T00:30:00Z'));
  });

  it('伦敦夏令时切换：春季不存在的本地时间仍可确定性换算', () => {
    const ms = localPartsToMs(
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
      'Europe/London',
    );
    expect(Number.isFinite(ms)).toBe(true);
    // 结果必然落在切换点 01:00Z 之后
    expect(ms).toBeGreaterThanOrEqual(toMs('2026-03-29T01:00:00Z'));
  });
});
