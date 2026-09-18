import { describe, expect, it } from 'vitest';
import {
  formatLocal,
  formatLocalShort,
  localToUtcMs,
  offsetLabel,
  tzOffsetMs,
  utcToLocalIso,
} from '../time';

const T = (s: string): number => Date.parse(s);

describe('时区换算：同一 UTC 时刻的三地本地时间', () => {
  const ms = T('2026-09-20T12:00:00Z');

  it('上海 / 新加坡 UTC+8，伦敦夏令时 UTC+1', () => {
    expect(formatLocal(ms, 'Asia/Shanghai')).toBe('2026-09-20 20:00:00');
    expect(formatLocal(ms, 'Asia/Singapore')).toBe('2026-09-20 20:00:00');
    expect(formatLocal(ms, 'Europe/London')).toBe('2026-09-20 13:00:00');
    expect(formatLocal(ms, 'UTC')).toBe('2026-09-20 12:00:00');
  });

  it('偏移标签', () => {
    expect(offsetLabel(ms, 'Asia/Shanghai')).toBe('UTC+8');
    expect(offsetLabel(ms, 'Asia/Singapore')).toBe('UTC+8');
    expect(offsetLabel(ms, 'Europe/London')).toBe('UTC+1');
    expect(offsetLabel(ms, 'UTC')).toBe('UTC+0');
  });
});

describe('伦敦冬令时（GMT）与夏令时（BST）', () => {
  it('冬季偏移为 UTC+0', () => {
    const ms = T('2026-01-15T12:00:00Z');
    expect(formatLocal(ms, 'Europe/London')).toBe('2026-01-15 12:00:00');
    expect(offsetLabel(ms, 'Europe/London')).toBe('UTC+0');
  });

  it('2026-03-29 01:00 UTC 时钟拨快：本地 01:30 不存在', () => {
    expect(offsetLabel(T('2026-03-29T00:30:00Z'), 'Europe/London')).toBe('UTC+0');
    expect(offsetLabel(T('2026-03-29T01:30:00Z'), 'Europe/London')).toBe('UTC+1');
    expect(formatLocal(T('2026-03-29T01:30:00Z'), 'Europe/London')).toBe('2026-03-29 02:30:00');
  });
});

describe('本地时间 → UTC 反解', () => {
  it('上海 20:00 = UTC 12:00', () => {
    expect(localToUtcMs('2026-09-20T20:00:00', 'Asia/Shanghai')).toBe(T('2026-09-20T12:00:00Z'));
  });

  it('伦敦夏令时 13:00 = UTC 12:00，冬令时 13:00 = UTC 13:00', () => {
    expect(localToUtcMs('2026-09-20T13:00:00', 'Europe/London')).toBe(T('2026-09-20T12:00:00Z'));
    expect(localToUtcMs('2026-01-15T13:00', 'Europe/London')).toBe(T('2026-01-15T13:00:00Z'));
  });

  it('datetime-local 不带秒也能解析', () => {
    expect(localToUtcMs('2026-09-20T20:00', 'Asia/Shanghai')).toBe(T('2026-09-20T12:00:00Z'));
  });

  it('往返一致：UTC → 本地 → UTC', () => {
    const ms = T('2026-09-20T12:34:56Z');
    for (const tz of ['Asia/Shanghai', 'Asia/Singapore', 'Europe/London', 'UTC']) {
      expect(localToUtcMs(utcToLocalIso(ms, tz), tz)).toBe(ms);
    }
  });
});

describe('跨零点窗口', () => {
  it('上海 22:00–次日 02:00 映射到 UTC 同一天 14:00–18:00', () => {
    const s = localToUtcMs('2026-09-20T22:00:00', 'Asia/Shanghai');
    const e = localToUtcMs('2026-09-21T02:00:00', 'Asia/Shanghai');
    expect(s).toBe(T('2026-09-20T14:00:00Z'));
    expect(e).toBe(T('2026-09-20T18:00:00Z'));
    // 窗口中点 上海 00:00 = UTC 16:00，落在 [s, e) 内
    const mid = localToUtcMs('2026-09-21T00:00:00', 'Asia/Shanghai');
    expect(mid).toBe(T('2026-09-20T16:00:00Z'));
    expect(mid).toBeGreaterThanOrEqual(s);
    expect(mid).toBeLessThan(e);
  });

  it('UTC 跨日的窗口在各时区显示为本地墙钟', () => {
    // UTC 23:00–次日 01:00 → 上海次日 07:00–09:00
    expect(formatLocal(T('2026-09-20T23:30:00Z'), 'Asia/Shanghai')).toBe('2026-09-21 07:30:00');
    expect(formatLocalShort(T('2026-09-20T23:30:00Z'), 'Europe/London')).toBe('00:30:00');
  });
});

describe('偏移计算', () => {
  it('tzOffsetMs 与 formatLocal 自洽', () => {
    const ms = T('2026-09-20T12:00:00Z');
    expect(tzOffsetMs(ms, 'Asia/Shanghai')).toBe(8 * 3_600_000);
    expect(tzOffsetMs(ms, 'Europe/London')).toBe(1 * 3_600_000);
    expect(tzOffsetMs(ms, 'UTC')).toBe(0);
  });
});
