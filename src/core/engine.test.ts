import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  createInitialScenario,
  deepCloneScenario,
} from './scenario';
import {
  describeIssue,
  describeStep,
  detectIssues,
  evaluateSegment,
} from './engine';
import type { ScenarioState } from './types';
import { toMs } from './time';

function scenario() {
  return createInitialScenario();
}

function evalAt(
  s: ScenarioState,
  regionId: string,
  channelId: string,
  iso: string,
) {
  const seg = s.segments[0];
  return evaluateSegment(s, seg, regionId, channelId, toMs(iso));
}

describe('内置案例：健康编排的跨地区选材', () => {
  const s = scenario();

  it('上海：直播中段选主片', () => {
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T20:30:00+08:00');
    expect(ev.selectedMaterialId).toBe('m_main');
    expect(ev.blackout).toBe(false);
    expect(ev.onAir).toBe(true);
    expect(ev.steps[0].status).toBe('selected');
  });

  it('上海：主片到期瞬间（21:00 零点切换）切到区域版', () => {
    const atBoundary = evalAt(s, 'sha', 'web', '2026-09-18T21:00:00+08:00');
    expect(atBoundary.selectedMaterialId).toBe('m_sha');
    expect(atBoundary.steps[0].status).toBe('outside');
    expect(atBoundary.steps[1].status).toBe('selected');

    // 边界前一毫秒仍是主片
    const justBefore = evalAt(
      s,
      'sha',
      'web',
      '2026-09-18T20:59:59.999+08:00',
    );
    expect(justBefore.selectedMaterialId).toBe('m_main');
  });

  it('上海：区域版结束后落到安全垫片（22:00 已停播，垫片窗口仍兜底）', () => {
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T22:30:00+08:00');
    expect(ev.selectedMaterialId).toBe('m_slate');
    expect(ev.steps[2].status).toBe('slate');
    expect(ev.onAir).toBe(false);
  });

  it('新加坡：主片 20:45 到期、区域版同时接力', () => {
    const ev = evalAt(s, 'sin', 'web', '2026-09-18T20:45:00+08:00');
    expect(ev.steps[0].status).toBe('outside');
    expect(ev.selectedMaterialId).toBe('m_sin');
  });

  it('伦敦：官网渠道在 19:30 选主片（BST）', () => {
    const ev = evalAt(s, 'lon', 'web', '2026-09-18T19:30:00+01:00');
    expect(ev.selectedMaterialId).toBe('m_main');
  });

  it('伦敦：OTT 渠道主片渠道不匹配，直接用区域版', () => {
    const ev = evalAt(s, 'lon', 'ott', '2026-09-18T19:30:00+01:00');
    expect(ev.steps[0].status).toBe('wrong-channel');
    expect(ev.selectedMaterialId).toBe('m_lon');
  });

  it('伦敦：18:15 主片未开始、区域版未开始 → 垫片', () => {
    const ev = evalAt(s, 'lon', 'web', '2026-09-18T18:15:00+01:00');
    expect(ev.selectedMaterialId).toBe('m_slate');
    expect(ev.steps[0].status).toBe('outside');
    expect(ev.steps[0].nextStartMs).toBe(toMs('2026-09-18T18:30:00+01:00'));
    expect(ev.steps[1].nextStartMs).toBe(toMs('2026-09-18T19:00:00+01:00'));
  });

  it('同一 UTC 时刻（12:30Z）上海在播、伦敦尚未开播', () => {
    const sha = evalAt(s, 'sha', 'web', '2026-09-18T12:30:00Z');
    const lon = evalAt(s, 'lon', 'web', '2026-09-18T12:30:00Z');
    expect(sha.onAir).toBe(true);
    expect(sha.selectedMaterialId).toBe('m_main');
    expect(lon.onAir).toBe(false);
  });

  it('伦敦 18:00Z（19:00 BST 开播瞬间）半开区间内视为在播', () => {
    const ev = evalAt(s, 'lon', 'web', '2026-09-18T18:00:00Z');
    expect(ev.onAir).toBe(true);
    // 主片窗口 17:30Z 已生效，链优先选主片
    expect(ev.selectedMaterialId).toBe('m_main');
  });

  it('伦敦 20:30 BST 主片到期瞬间切区域版', () => {
    const ev = evalAt(s, 'lon', 'web', '2026-09-18T20:30:00+01:00');
    expect(ev.steps[0].status).toBe('outside');
    expect(ev.selectedMaterialId).toBe('m_lon');
  });
});

describe('生效前 / 临界 / 失效后 路径解释', () => {
  const s = scenario();

  it('生效前：outside 步骤带 nextStartMs', () => {
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T19:00:00+08:00');
    const mainStep = ev.steps[0];
    expect(mainStep.status).toBe('outside');
    expect(mainStep.nextStartMs).toBe(toMs('2026-09-18T19:30:00+08:00'));
    expect(describeStep(s, mainStep, toMs('2026-09-18T19:00:00+08:00'))).toContain(
      '尚未开始',
    );
  });

  it('失效后：outside 步骤带 lastEndMs', () => {
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T21:30:00+08:00');
    const mainStep = ev.steps[0];
    expect(mainStep.status).toBe('outside');
    expect(mainStep.lastEndMs).toBe(toMs('2026-09-18T21:00:00+08:00'));
    expect(describeStep(s, mainStep, toMs('2026-09-18T21:30:00+08:00'))).toContain(
      '失效',
    );
  });

  it('地区不匹配：上海链中不会出现伦敦区域版；构造后应报 wrong-region', () => {
    const s2 = deepCloneScenario(s);
    s2.segments[0].scheduleByRegion.sha.chain = ['m_main', 'm_lon', 'm_slate'];
    // 主片有效，wrong-region 不影响结果，但在 21:30 主片失效后暴露
    const ev2 = evalAt(s2, 'sha', 'web', '2026-09-18T21:30:00+08:00');
    expect(ev2.steps[1].status).toBe('wrong-region');
    expect(ev2.steps[1].otherRegions).toEqual(['lon']);
    expect(describeStep(s2, ev2.steps[1], 0)).toContain('伦敦');
    expect(ev2.selectedMaterialId).toBe('m_slate');
  });
});

describe('冲突检测', () => {
  it('健康编排无 error 级问题（允许边界相邻不视为空档）', () => {
    const issues = detectIssues(scenario(), { stepMs: 30_000 });
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('窗口重叠：临时补发窗口与原窗口重叠被报告', () => {
    const s = PRESETS.find((p) => p.id === 'preset_overlap')!.build();
    const issues = detectIssues(s, { stepMs: 30_000 });
    const overlap = issues.find((i) => i.kind === 'overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.materialIds).toEqual(['m_main']);
    expect(overlap!.regionId).toBe('sha');
    expect(overlap!.startMs).toBe(toMs('2026-09-18T20:30:00+08:00'));
    expect(overlap!.endMs).toBe(toMs('2026-09-18T21:00:00+08:00'));
    expect(describeIssue(s, overlap!)).toContain('窗口重叠');
  });

  it('重叠时刻选材仍确定：选开始最早的窗口（原窗口）', () => {
    const s = PRESETS.find((p) => p.id === 'preset_overlap')!.build();
    const ev1 = evalAt(s, 'sha', 'web', '2026-09-18T20:45:00+08:00');
    const ev2 = evalAt(s, 'sha', 'web', '2026-09-18T20:45:00+08:00');
    expect(ev1.steps[0].status).toBe('selected-overlap');
    expect(ev1.selectedWindowId).toBe('w_main_sha');
    // 同输入重复演练结果一致
    expect(ev2.selectedWindowId).toBe(ev1.selectedWindowId);
  });

  it('临时撤权：垫片窗口覆盖该时段，不产生空档但选材降级', () => {
    const s = PRESETS.find((p) => p.id === 'preset_revoke')!.build();
    const issues = detectIssues(s, { stepMs: 60_000 });
    const gaps = issues.filter(
      (i) => i.kind === 'gap' && i.regionId === 'sha' && i.channelId === 'web',
    );
    expect(gaps).toEqual([]);
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T20:45:00+08:00');
    expect(ev.steps[0].status).toBe('outside');
    expect(ev.selectedMaterialId).toBe('m_slate');
  });

  it('真实空档：连垫片窗口也被撤掉时报告 gap', () => {
    const s = PRESETS.find((p) => p.id === 'preset_revoke')!.build();
    s.windows = s.windows.filter((x) => x.id !== 'w_slate_sha');
    const issues = detectIssues(s, { stepMs: 60_000 });
    const gaps = issues.filter(
      (i) => i.kind === 'gap' && i.regionId === 'sha' && i.channelId === 'web',
    );
    expect(gaps.length).toBeGreaterThan(0);
    const merged = gaps.reduce(
      (acc, g) => ({
        start: Math.min(acc.start, g.startMs!),
        end: Math.max(acc.end, g.endMs!),
      }),
      { start: Infinity, end: -Infinity },
    );
    expect(merged.start).toBeLessThanOrEqual(toMs('2026-09-18T20:31:00+08:00'));
    expect(merged.end).toBeGreaterThanOrEqual(toMs('2026-09-18T20:59:00+08:00'));
    expect(describeIssue(s, gaps[0])).toContain('授权空档');
  });

  it('替代链断裂：引用不存在的素材', () => {
    const s = PRESETS.find((p) => p.id === 'preset_broken')!.build();
    const issues = detectIssues(s, { stepMs: 120_000 });
    const broken = issues.find((i) => i.kind === 'broken-chain');
    expect(broken).toBeDefined();
    expect(broken!.materialIds).toEqual(['m_sha_cut']);
    const ev = evalAt(s, 'sha', 'web', '2026-09-18T21:15:00+08:00');
    expect(ev.steps[1].status).toBe('missing');
    expect(describeStep(s, ev.steps[1], 0)).toContain('断裂');
    // 断裂后继续沿链，垫片仍兜底
    expect(ev.selectedMaterialId).toBe('m_slate');
  });

  it('替代链循环：重复节点标 cycle，区域版无窗口时最终黑屏', () => {
    const s = PRESETS.find((p) => p.id === 'preset_cycle')!.build();
    const issues = detectIssues(s, { stepMs: 120_000 });
    const cycle = issues.find((i) => i.kind === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle!.materialIds).toEqual(['m_main']);
    // 主片有效期内仍正常
    const before = evalAt(s, 'sha', 'web', '2026-09-18T20:00:00+08:00');
    expect(before.selectedMaterialId).toBe('m_main');
    // 21:00 后：主片失效 → 区域版未授权 → 回到主片标 cycle → 黑屏
    const after = evalAt(s, 'sha', 'web', '2026-09-18T21:15:00+08:00');
    expect(after.steps[2].status).toBe('cycle');
    expect(after.blackout).toBe(true);
    expect(after.selectedMaterialId).toBeNull();
  });

  it('渠道维度：伦敦主片仅官网，OTT 不产生重叠误报', () => {
    const issues = detectIssues(scenario(), { stepMs: 120_000 });
    const lonOverlap = issues.find(
      (i) => i.kind === 'overlap' && i.regionId === 'lon',
    );
    expect(lonOverlap).toBeUndefined();
  });

  it('未安排播出的地区给出 gap 提示', () => {
    const s = deepCloneScenario(scenario());
    delete s.segments[0].scheduleByRegion.lon;
    const issues = detectIssues(s);
    const noSchedule = issues.find(
      (i) => i.kind === 'gap' && i.regionId === 'lon' && !i.channelId,
    );
    expect(noSchedule).toBeDefined();
    const ev = evaluateSegment(
      s,
      s.segments[0],
      'lon',
      'web',
      toMs('2026-09-18T19:30:00+01:00'),
    );
    expect(ev.blackout).toBe(true);
  });
});

describe('确定性', () => {
  it('同一输入重复演练得到完全相同的结果', () => {
    const s = PRESETS.find((p) => p.id === 'preset_overlap')!.build();
    const times = [
      '2026-09-18T20:30:00+08:00',
      '2026-09-18T21:00:00+08:00',
      '2026-09-18T20:45:00+08:00',
    ];
    for (const t of times) {
      const a = evalAt(s, 'sha', 'web', t);
      const b = evalAt(deepCloneScenario(s), 'sha', 'web', t);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it('窗口数组顺序打乱不影响选材', () => {
    const s = PRESETS.find((p) => p.id === 'preset_overlap')!.build();
    const reversed = deepCloneScenario(s);
    reversed.windows.reverse();
    const a = evalAt(s, 'sha', 'web', '2026-09-18T20:45:00+08:00');
    const b = evalAt(reversed, 'sha', 'web', '2026-09-18T20:45:00+08:00');
    expect(b.selectedWindowId).toBe(a.selectedWindowId);
  });

  it('冲突检测结果稳定', () => {
    const s = PRESETS.find((p) => p.id === 'preset_broken')!.build();
    const a = detectIssues(s).map((i) => JSON.stringify(i)).sort();
    const b = detectIssues(deepCloneScenario(s))
      .map((i) => JSON.stringify(i))
      .sort();
    expect(b).toEqual(a);
  });
});

describe('边界极限：无始/无终窗口', () => {
  it('null start/end 的窗口始终有效', () => {
    const s = deepCloneScenario(scenario());
    s.windows.find((w) => w.id === 'w_main_sha')!.end = null;
    const ev = evalAt(s, 'sha', 'web', '2026-09-20T08:00:00+08:00');
    expect(ev.selectedMaterialId).toBe('m_main');
  });
});
