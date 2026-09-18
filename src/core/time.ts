/**
 * 时间工具：以毫秒时间戳（UTC epoch ms）为唯一内部表示，
 * 展示/录入时再按 IANA 时区换算。不依赖任何第三方时区库。
 */

export type ISO = string;

/** ISO 字符串 → epoch ms（非法输入抛错） */
export function toMs(iso: ISO): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`非法时间: ${iso}`);
  return t;
}

/** epoch ms → ISO（Z 结尾） */
export function toIso(ms: number): ISO {
  return new Date(ms).toISOString();
}

/** 判断半开区间 [start, end) 是否包含 t；null 端不限 */
export function contains(
  t: number,
  start: number | null,
  end: number | null,
): boolean {
  return (start === null || t >= start) && (end === null || t < end);
}

const minuteMs = 60_000;
const hourMs = 3_600_000;

/** 某时刻在给定 IANA 时区下相对当地零点的偏移（ms） */
export function tzOffsetMs(atMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUTC - Math.floor(atMs / minuteMs) * minuteMs;
}

/** 时区缩写/名，如 CST、+08、GMT */
export function tzAbbr(atMs: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(new Date(atMs));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 完整本地时间：2026-09-18 20:00:00 (+08:00) */
export function formatLocal(atMs: number, timeZone: string): string {
  const off = tzOffsetMs(atMs, timeZone);
  const local = atMs + off;
  const d = new Date(local);
  const sign = off >= 0 ? '+' : '-';
  const oh = Math.floor(Math.abs(off) / hourMs);
  const om = Math.round((Math.abs(off) % hourMs) / minuteMs);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
      d.getUTCDate(),
    )} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(
      d.getUTCSeconds(),
    )} (UTC${sign}${pad2(oh)}:${pad2(om)})`
  );
}

/** 仅时分：20:00 */
export function formatLocalHM(atMs: number, timeZone: string): string {
  const off = tzOffsetMs(atMs, timeZone);
  const d = new Date(atMs + off);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** 紧凑日期时间，用于滑块刻度：09-18 20:00 */
export function formatLocalShort(atMs: number, timeZone: string): string {
  const off = tzOffsetMs(atMs, timeZone);
  const d = new Date(atMs + off);
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(
    d.getUTCHours(),
  )}:${pad2(d.getUTCMinutes())}`;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

/** 解析某时区下的“本地墙钟时间”为 epoch ms。
 *  春跳等不存在的本地时间按该时区当时的标准偏移前移；
 *  秋季重叠的歧义时间取较早的瞬间（offset 较大者）。 */
export function localPartsToMs(parts: LocalParts, timeZone: string): number {
  const y = parts.year;
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const mm = String(parts.minute).padStart(2, '0');
  const guess = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
  // 取该本地时间可能对应的两个偏移中较大的一个（较早瞬间）
  const offEarly = tzOffsetMs(guess - hourMs * 14, timeZone);
  const offLate = tzOffsetMs(guess + hourMs * 14, timeZone);
  const off = Math.max(offEarly, offLate);
  // 校正：保证换算回来的墙钟与输入一致（春跳时跳过空档）
  let ms = guess - off;
  const back = tzOffsetMs(ms, timeZone);
  if (back !== off) ms = guess - back;
  return ms;
}

/** 拆出某时刻在指定时区的本地部件，供表单回填 */
export function toLocalParts(atMs: number, timeZone: string): LocalParts {
  const d = new Date(atMs + tzOffsetMs(atMs, timeZone));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** 表单用的 datetime-local 字符串（无时区后缀，按所选地区时区解释） */
export function toLocalInputValue(atMs: number, timeZone: string): string {
  const p = toLocalParts(atMs, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(
    p.minute,
  )}`;
}

/** datetime-local 值 + 时区 → ISO（绝对时刻） */
export function localInputToIso(value: string, timeZone: string): ISO {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`表单时间格式错误: ${value}`);
  const ms = localPartsToMs(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
    },
    timeZone,
  );
  return toIso(ms);
}

/** 毫秒时长的人类可读形式 */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const a = Math.abs(ms);
  const days = Math.floor(a / 86_400_000);
  const hours = Math.floor((a % 86_400_000) / hourMs);
  const mins = Math.round((a % hourMs) / minuteMs);
  const bits: string[] = [];
  if (days) bits.push(`${days}天`);
  if (hours) bits.push(`${hours}小时`);
  if (mins || bits.length === 0) bits.push(`${mins}分钟`);
  return sign + bits.join('');
}
