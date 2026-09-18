import type {
  ChainStep,
  Evaluation,
  Issue,
  Material,
  Region,
  RightsWindow,
  ScenarioState,
  Segment,
} from './types';
import { contains, toMs } from './time';

interface ParsedWindow {
  w: RightsWindow;
  startMs: number | null;
  endMs: number | null;
}

// 以 windows 数组引用为键的解析缓存：空档扫描会对同一数组反复求值
const parseCache = new WeakMap<RightsWindow[], Map<string, ParsedWindow[]>>();

function parseWindows(windows: RightsWindow[]): Map<string, ParsedWindow[]> {
  const cached = parseCache.get(windows);
  if (cached) return cached;
  const byMaterial = new Map<string, ParsedWindow[]>();
  for (const w of windows) {
    const pw: ParsedWindow = {
      w,
      startMs: w.start === null ? null : toMs(w.start),
      endMs: w.end === null ? null : toMs(w.end),
    };
    if (pw.startMs !== null && pw.endMs !== null && pw.endMs <= pw.startMs) {
      // 终点不晚于起点的窗口属于无效数据，仍然保留以便报告；这里交给校验。
    }
    const list = byMaterial.get(w.materialId) ?? [];
    list.push(pw);
    byMaterial.set(w.materialId, list);
  }
  parseCache.set(windows, byMaterial);
  return byMaterial;
}

function channelMatches(w: RightsWindow, channelId: string): boolean {
  return w.channelIds.length === 0 || w.channelIds.includes(channelId);
}

export interface EvaluateOptions {
  /** 允许的替代遍历深度，超过视为超长链（防御） */
  maxDepth?: number;
}

/**
 * 在给定地区、渠道、时刻评估某段落的替代链选材。
 * 链按顺序尝试：第一个在此时刻拥有“匹配地区+匹配渠道”有效窗口的素材胜出。
 */
export function evaluateSegment(
  scenario: Pick<
    ScenarioState,
    'regions' | 'channels' | 'materials' | 'windows'
  >,
  segment: Segment,
  regionId: string,
  channelId: string,
  atMs: number,
  opts: EvaluateOptions = {},
): Evaluation {
  const maxDepth = opts.maxDepth ?? 64;
  const schedule = segment.scheduleByRegion[regionId];
  const byMaterial = parseWindows(scenario.windows);
  const regionIds = new Set(scenario.regions.map((r) => r.id));
  const materialById = new Map(scenario.materials.map((m) => [m.id, m]));

  const steps: ChainStep[] = [];
  let selectedMaterialId: string | null = null;
  let selectedWindowId: string | null = null;

  if (!schedule) {
    return {
      atMs,
      regionId,
      channelId,
      steps,
      selectedMaterialId: null,
      selectedWindowId: null,
      blackout: true,
      onAir: false,
    };
  }

  const onAir = contains(
    atMs,
    toMs(schedule.start),
    toMs(schedule.end),
  );

  const seen = new Set<string>();
  const orderedIds = schedule.chain;
  // 去重保留首次出现位置，重复出现的素材标记 cycle
  const cyclePositions = new Set<number>();

  orderedIds.forEach((id, i) => {
    if (seen.has(id)) cyclePositions.add(i);
    seen.add(id);
  });

  for (let i = 0; i < Math.min(orderedIds.length, maxDepth); i++) {
    const materialId = orderedIds[i];
    const material = materialById.get(materialId);
    const pws = byMaterial.get(materialId) ?? [];

    if (!material) {
      steps.push({ index: i, materialId, status: 'missing' });
      continue;
    }
    if (cyclePositions.has(i)) {
      steps.push({
        index: i,
        materialId,
        status: 'cycle',
        activeWindowIds: collectActive(pws, regionId, channelId, atMs),
      });
      continue;
    }

    // 该素材在此地区的全部窗口
    const inRegion = pws.filter((p) => p.w.regionId === regionId);
    // 素材挂在别的地区的授权（用于解释地区不匹配）
    const otherRegions = unique(
      pws.map((p) => p.w.regionId).filter((r) => r !== regionId),
    );

    // 地区匹配 + 渠道匹配 + 时刻有效
    const eligible = inRegion.filter(
      (p) => channelMatches(p.w, channelId) && contains(atMs, p.startMs, p.endMs),
    );
    const channelBlocked = inRegion.filter(
      (p) => !channelMatches(p.w, channelId) && contains(atMs, p.startMs, p.endMs),
    );

    if (eligible.length > 0) {
      // 确定性选择：窗口按 (startMs 最早, id 字典序) 排序取首；
      // 多个窗口同时有效属于 overlap 冲突，由 detectIssues 报告。
      const winner = pickDeterministic(eligible);
      const status = eligible.length > 1 ? 'selected-overlap' : 'selected';
      steps.push({
        index: i,
        materialId,
        status,
        windowId: winner.w.id,
        activeWindowIds: eligible.map((p) => p.w.id),
        blockedChannelWindowIds: channelBlocked.map((p) => p.w.id),
      });
      selectedMaterialId = materialId;
      selectedWindowId = winner.w.id;
      break;
    }

    // 时刻有效但渠道不匹配
    if (channelBlocked.length > 0) {
      steps.push({
        index: i,
        materialId,
        status: 'wrong-channel',
        blockedChannelWindowIds: channelBlocked.map((p) => p.w.id),
        ...nearestBounds(inRegion, atMs),
      });
      continue;
    }

    // 地区不匹配：素材在别的地区有授权，或素材 ownerRegion 属于其他地区
    if (
      inRegion.length === 0 &&
      (otherRegions.length > 0 ||
        (material.ownerRegionId && material.ownerRegionId !== regionId))
    ) {
      const owners = unique([
        ...otherRegions,
        ...(material.ownerRegionId && material.ownerRegionId !== regionId
          ? [material.ownerRegionId]
          : []),
      ]).filter((r) => regionIds.has(r));
      steps.push({
        index: i,
        materialId,
        status: owners.length > 0 ? 'wrong-region' : 'unlicensed',
        otherRegions: owners,
      });
      continue;
    }

    // 本地区有窗口但时刻不在任何窗口内：未生效/已失效
    if (inRegion.length > 0) {
      steps.push({
        index: i,
        materialId,
        status: 'outside',
        ...nearestBounds(inRegion, atMs),
      });
      continue;
    }

    steps.push({ index: i, materialId, status: 'unlicensed' });
  }

  if (orderedIds.length > maxDepth) {
    // 超长链：剩余节点无法评估
  }

  // 垫片（slate）即使被选中也记录为 slate 状态以便解释
  if (selectedMaterialId) {
    const m = materialById.get(selectedMaterialId);
    const step = steps.find((s) => s.materialId === selectedMaterialId);
    if (m?.kind === 'slate' && step && step.status === 'selected') {
      step.status = 'slate';
    }
  }

  return {
    atMs,
    regionId,
    channelId,
    steps,
    selectedMaterialId,
    selectedWindowId,
    blackout: selectedMaterialId === null,
    onAir,
  };
}

function collectActive(
  pws: ParsedWindow[],
  regionId: string,
  channelId: string,
  atMs: number,
): string[] {
  return pws
    .filter(
      (p) =>
        p.w.regionId === regionId &&
        channelMatches(p.w, channelId) &&
        contains(atMs, p.startMs, p.endMs),
    )
    .map((p) => p.w.id);
}

function nearestBounds(pws: ParsedWindow[], atMs: number): {
  nextStartMs?: number;
  lastEndMs?: number;
} {
  let nextStartMs: number | undefined;
  let lastEndMs: number | undefined;
  for (const p of pws) {
    if (p.startMs !== null && p.startMs > atMs) {
      nextStartMs =
        nextStartMs === undefined ? p.startMs : Math.min(nextStartMs, p.startMs);
    }
    if (p.endMs !== null && p.endMs <= atMs) {
      lastEndMs =
        lastEndMs === undefined ? p.endMs : Math.max(lastEndMs, p.endMs);
    }
  }
  return { nextStartMs, lastEndMs };
}

function pickDeterministic(pws: ParsedWindow[]): ParsedWindow {
  return [...pws].sort((a, b) => {
    const sa = a.startMs ?? Number.NEGATIVE_INFINITY;
    const sb = b.startMs ?? Number.NEGATIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return a.w.id.localeCompare(b.w.id);
  })[0];
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/* ------------------------------------------------------------------ */
/* 冲突检测                                                            */
/* ------------------------------------------------------------------ */

export interface DetectOptions {
  /** 扫描空档/重叠时的步长（ms），默认 1 分钟 */
  stepMs?: number;
}

/**
 * 对整份编排做静态体检：
 * - overlap：同一素材/地区/渠道在同一时刻有多个窗口重叠（或同一链位窗口互叠）
 * - gap：某地区段落的播出时段内，整条替代链都没有任何可用素材的空档
 * - region-mismatch：链中素材在该地区完全没有窗口
 * - broken-chain：链引用了不存在的素材
 * - cycle：链内素材重复（自循环/环）
 * - unlicensed：素材在任何地区都没有窗口
 */
export function detectIssues(
  scenario: ScenarioState,
  opts: DetectOptions = {},
): Issue[] {
  const stepMs = opts.stepMs ?? 60_000;
  const issues: Issue[] = [];
  const materialById = new Map(scenario.materials.map((m) => [m.id, m]));
  const byMaterial = parseWindows(scenario.windows);

  /* 窗口重叠：按 素材+地区+渠道维度 检查区间重叠 */
  for (const [materialId, pws] of byMaterial) {
    for (const regionId of unique(pws.map((p) => p.w.regionId))) {
      const inRegion = pws.filter((p) => p.w.regionId === regionId);
      // 渠道维：空数组（全部渠道）与每个具体渠道都算同一授权空间
      const channelKeys = unique(
        inRegion.flatMap((p) =>
          p.w.channelIds.length === 0
            ? scenario.channels.map((c) => c.id)
            : p.w.channelIds,
        ),
      );
      for (const chId of channelKeys) {
        const members = inRegion.filter((p) => channelMatches(p.w, chId));
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const ov = overlapRange(members[a], members[b]);
            if (ov) {
              issues.push({
                kind: 'overlap',
                severity: 'error',
                regionId,
                channelId: chId,
                materialIds: [materialId],
                windowIds: [members[a].w.id, members[b].w.id],
                startMs: ov[0],
                endMs: ov[1],
              });
            }
          }
        }
      }
    }
  }

  /* 链结构 + 空档扫描（逐地区、逐渠道） */
  for (const segment of scenario.segments) {
    for (const region of scenario.regions) {
      const schedule = segment.scheduleByRegion[region.id];
      if (!schedule) {
        issues.push({
          kind: 'gap',
          severity: 'warning',
          segmentId: segment.id,
          regionId: region.id,
        });
        continue;
      }

      const seen = new Set<string>();
      schedule.chain.forEach((mid) => {
        if (seen.has(mid)) {
          issues.push({
            kind: 'cycle',
            severity: 'error',
            segmentId: segment.id,
            regionId: region.id,
            materialIds: [mid],
          });
        }
        seen.add(mid);
      });

      for (const mid of schedule.chain) {
        const material = materialById.get(mid);
        if (!material) {
          issues.push({
            kind: 'broken-chain',
            severity: 'error',
            segmentId: segment.id,
            regionId: region.id,
            materialIds: [mid],
          });
          continue;
        }
        const pws = byMaterial.get(mid) ?? [];
        if (pws.length === 0) {
          issues.push({
            kind: 'unlicensed',
            severity: 'warning',
            segmentId: segment.id,
            regionId: region.id,
            materialIds: [mid],
          });
        } else if (!pws.some((p) => p.w.regionId === region.id)) {
          issues.push({
            kind: 'region-mismatch',
            severity: 'warning',
            segmentId: segment.id,
            regionId: region.id,
            materialIds: [mid],
          });
        }
      }

      for (const channel of scenario.channels) {
        const gapRanges = scanGaps(
          scenario,
          segment,
          region.id,
          channel.id,
          toMs(schedule.start),
          toMs(schedule.end),
          stepMs,
        );
        for (const [gStart, gEnd] of gapRanges) {
          issues.push({
            kind: 'gap',
            severity: 'warning',
            segmentId: segment.id,
            regionId: region.id,
            channelId: channel.id,
            startMs: gStart,
            endMs: gEnd,
          });
        }
      }
    }
  }

  // 去重（同一 window 对/同一段落地区渠道可能被多次加入）
  return dedupeIssues(issues);
}

function overlapRange(a: ParsedWindow, b: ParsedWindow): [number, number] | null {
  const s = Math.max(a.startMs ?? -Infinity, b.startMs ?? -Infinity);
  const e = Math.min(a.endMs ?? Infinity, b.endMs ?? Infinity);
  if (s < e) {
    return [
      s === -Infinity ? -Infinity : s,
      e === Infinity ? Infinity : e,
    ];
  }
  return null;
}

/** 在播出时段内步进扫描整条链都无授权的连续区间 */
function scanGaps(
  scenario: ScenarioState,
  segment: Segment,
  regionId: string,
  channelId: string,
  segStart: number,
  segEnd: number,
  stepMs: number,
): [number, number][] {
  const ranges: [number, number][] = [];
  let gapStart: number | null = null;
  for (let t = segStart; t < segEnd; t += stepMs) {
    const ev = evaluateSegment(scenario, segment, regionId, channelId, t);
    if (ev.blackout) {
      if (gapStart === null) gapStart = t;
    } else if (gapStart !== null) {
      ranges.push([gapStart, t]);
      gapStart = null;
    }
  }
  if (gapStart !== null) ranges.push([gapStart, segEnd]);
  return ranges;
}

function issueKey(i: Issue): string {
  return JSON.stringify([
    i.kind,
    i.segmentId,
    i.regionId,
    i.channelId,
    (i.materialIds ?? []).join('>'),
    (i.windowIds ?? []).sort().join('>'),
    i.startMs,
    i.endMs,
  ]);
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const map = new Map<string, Issue>();
  for (const i of issues) map.set(issueKey(i), i);
  return [...map.values()];
}

/* ------------------------------------------------------------------ */
/* 解释文案                                                            */
/* ------------------------------------------------------------------ */

export function materialName(
  scenario: Pick<ScenarioState, 'materials'>,
  id: string | null,
): string {
  if (!id) return '（无）';
  return scenario.materials.find((m) => m.id === id)?.name ?? `未知素材 ${id}`;
}

export function regionName(
  scenario: Pick<ScenarioState, 'regions'>,
  id: string | undefined,
): string {
  if (!id) return '?';
  return scenario.regions.find((r) => r.id === id)?.name ?? id;
}

export function channelName(
  scenario: Pick<ScenarioState, 'channels'>,
  id: string | undefined,
): string {
  if (!id) return '?';
  return scenario.channels.find((c) => c.id === id)?.name ?? id;
}

export { regionName as getRegionName };

export function describeStep(
  scenario: Pick<ScenarioState, 'regions' | 'channels' | 'materials'>,
  step: ChainStep,
  atMs: number,
): string {
  const m = materialName(scenario, step.materialId);
  switch (step.status) {
    case 'selected':
      return `✔ 选用「${m}」：授权窗口此刻有效（地区与渠道均匹配）`;
    case 'selected-overlap':
      return `✔ 选用「${m}」，但该素材此刻有 ${
        step.activeWindowIds?.length ?? 0
      } 个窗口重叠，已按规则（最早开始、编号优先）确定地选中其中一个`;
    case 'slate':
      return `✔ 上游素材均不可用，降级到安全垫片「${m}」`;
    case 'outside': {
      const bits: string[] = [];
      if (step.lastEndMs !== undefined)
        bits.push(
          `授权已于当地边界结束（半开区间，结束瞬间即失效，距今 ${relative(
            atMs,
            step.lastEndMs,
          )}）`,
        );
      if (step.nextStartMs !== undefined)
        bits.push(
          `授权尚未开始（开始瞬间即生效，还需 ${relative(
            step.nextStartMs,
            atMs,
          )}）`,
        );
      return `✗ 「${m}」此刻不在授权窗口内：${bits.join('；') || '无有效窗口覆盖此刻'}`;
    }
    case 'wrong-channel':
      return `✗ 「${m}」在该地区此刻有授权，但不覆盖当前渠道`;
    case 'wrong-region':
      return `✗ 「${m}」是区域版素材，授权地区为 ${
        step.otherRegions
          ?.map((r) => scenario.regions.find((x) => x.id === r)?.name ?? r)
          .join('、') ?? '其他地区'
      }，与当前地区不匹配`;
    case 'missing':
      return `✗ 链引用的素材「${step.materialId}」不存在（替代链断裂）`;
    case 'unlicensed':
      return `✗ 「${m}」在当前地区没有任何授权窗口`;
    case 'cycle':
      return `↻ 「${m}」在替代链中重复出现，形成循环，停止继续沿链查找`;
  }
}

function relative(a: number, b: number): string {
  const ms = a - b;
  const mins = Math.round(ms / 60_000);
  const abs = Math.abs(mins);
  const word =
    abs < 60
      ? `${abs} 分钟`
      : abs < 1440
        ? `${Math.round(abs / 60)} 小时`
        : `${Math.round(abs / 1440)} 天`;
  return mins >= 0 ? `再过 ${word}` : `${word}前`;
}

export function describeIssue(
  scenario: Pick<
    ScenarioState,
    'regions' | 'channels' | 'materials' | 'segments'
  >,
  issue: Issue,
): string {
  const seg = issue.segmentId
    ? scenario.segments.find((s) => s.id === issue.segmentId)?.name ??
      issue.segmentId
    : null;
  const reg = issue.regionId
    ? scenario.regions.find((r) => r.id === issue.regionId)?.name ??
      issue.regionId
    : null;
  const ch = issue.channelId
    ? scenario.channels.find((c) => c.id === issue.channelId)?.name ??
      issue.channelId
    : null;
  const mats = (issue.materialIds ?? [])
    .map((id) => materialName(scenario, id))
    .join('、');
  const where = [reg, ch].filter(Boolean).join(' / ');
  switch (issue.kind) {
    case 'overlap':
      return `窗口重叠：素材「${mats}」在 ${where} 有多个授权窗口同时有效`;
    case 'gap':
      return `授权空档：段落「${seg}」在 ${where}${
        issue.startMs !== undefined && issue.endMs !== undefined
          ? ' 的一段播出时间内整条替代链都无可用素材'
          : ' 没有播出安排'
      }`;
    case 'region-mismatch':
      return `地区不匹配：段落「${seg}」在 ${reg} 的替代链引用了「${mats}」，但该素材在此地区没有授权窗口`;
    case 'broken-chain':
      return `替代链断裂：段落「${seg}」在 ${reg} 的链引用了不存在的素材「${
        issue.materialIds?.[0]
      }」`;
    case 'cycle':
      return `替代链循环：段落「${seg}」在 ${reg} 的链中「${mats}」重复出现`;
    case 'unlicensed':
      return `素材「${mats}」未被任何授权窗口覆盖（段落「${seg}」/ ${reg}）`;
  }
}

export type { Material, Region };
