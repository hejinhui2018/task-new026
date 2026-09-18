/**
 * 时区换算工具。全部基于 Intl，无外部依赖、无系统时区副作用，保证确定性。
 * 所有窗口边界在内部一律用 UTC 毫秒表示；只有展示与编辑时才换算到地区本地时间。
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** UTC 毫秒 → 某时区的墙钟各部分。 */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const get = (t: string): string => parts.find((x) => x.type === t)?.value ?? '';
  let h = Number(get('hour'));
  if (h === 24) h = 0; // 个别 ICU 版本午夜返回 24
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h,
    mi: Number(get('minute')),
    s: Number(get('second')),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "2026-09-20 20:00:00" */
export function formatLocal(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

/** "20:00:00" */
export function formatLocalShort(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

/** "2026-09-20T20:00:00"，可直接喂给 datetime-local 输入框。 */
export function utcToLocalIso(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

/** 某时区在某 UTC 时刻的偏移（毫秒，本地 = UTC + 偏移）。 */
export function tzOffsetMs(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms;
}

/**
 * 地区本地墙钟（"YYYY-MM-DDTHH:mm[:ss]"）→ UTC 毫秒。
 * 通过迭代求偏移的不动点，可正确处理夏令时切换附近的时间。
 */
export function localToUtcMs(localIso: string, timeZone: string): number {
  const m = localIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`无法解析本地时间: ${localIso}`);
  const wall = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0,
  );
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const next = wall - tzOffsetMs(guess, timeZone);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** "UTC+8" / "UTC+1" / "UTC+0" / "UTC+5:30" */
export function offsetLabel(ms: number, timeZone: string): string {
  const offMin = Math.round(tzOffsetMs(ms, timeZone) / 60000);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad(m)}`;
}

/** "1 小时 2 分钟 5 秒" */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} 小时`);
  if (m) parts.push(`${m} 分钟`);
  if (sec || parts.length === 0) parts.push(`${sec} 秒`);
  return parts.join(' ');
}

/** 毫秒 → UTC ISO 字符串。 */
export function toUtcIso(ms: number): string {
  return new Date(ms).toISOString();
}
