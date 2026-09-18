import { useMemo, useState } from 'react';
import { useStore, genId } from '../state/store';
import { detectIssues } from '../core/engine';
import type { RightsWindow } from '../core/types';
import {
  localInputToIso,
  toLocalInputValue,
  toMs,
} from '../core/time';

type Tab = 'windows' | 'chain';

export function EditorsPanel() {
  const [tab, setTab] = useState<Tab>('windows');
  return (
    <div className="panel">
      <div className="section-tabs">
        <button className={tab === 'windows' ? 'active' : ''} onClick={() => setTab('windows')}>
          授权窗口
        </button>
        <button className={tab === 'chain' ? 'active' : ''} onClick={() => setTab('chain')}>
          替代链与播出时段
        </button>
      </div>
      {tab === 'windows' ? <WindowsEditor /> : <ChainEditor />}
    </div>
  );
}

/* ------------------------------ 窗口编辑 ------------------------------ */

function WindowsEditor() {
  const { state, mutate } = useStore();
  const { scenario, regionId } = state;
  const region = scenario.regions.find((r) => r.id === regionId)!;

  const overlapWindowIds = useMemo(() => {
    const issues = detectIssues(scenario, { stepMs: 300_000 });
    return new Set(
      issues
        .filter((i) => i.kind === 'overlap')
        .flatMap((i) => i.windowIds ?? []),
    );
  }, [scenario]);

  const wins = scenario.windows
    .filter((w) => w.regionId === regionId)
    .sort((a, b) => toMs(a.start ?? scenario.span.start) - toMs(b.start ?? scenario.span.start));

  function update(id: string, patch: Partial<RightsWindow>) {
    mutate((d) => {
      const w = d.windows.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
    });
  }

  function editBoundary(
    w: RightsWindow,
    key: 'start' | 'end',
    raw: string,
  ) {
    if (raw === '') {
      update(w.id, { [key]: null });
    } else {
      try {
        update(w.id, { [key]: localInputToIso(raw, region.timeZone) });
      } catch {
        // 非法输入忽略
      }
    }
  }

  function addWindow() {
    mutate((d) => {
      d.windows.push({
        id: genId('w'),
        materialId: d.materials[0].id,
        regionId,
        channelIds: [],
        start: scenario.span.start,
        end: scenario.span.end,
        label: '新窗口',
      });
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span className="tz-note">
          编辑地区：{region.name}　|　时间输入框按 {region.timeZone} 当地墙钟解释，保存为 UTC 绝对时刻
        </span>
        <button className="tiny primary" onClick={addWindow}>
          + 新增窗口
        </button>
      </div>

      {wins.map((w) => {
        const mat = scenario.materials.find((m) => m.id === w.materialId);
        return (
          <div
            key={w.id}
            className={`win-card ${overlapWindowIds.has(w.id) ? 'has-overlap' : ''}`}
          >
            <div className="win-head">
              <input
                className="win-label-input"
                value={w.label ?? ''}
                placeholder="窗口名称"
                onChange={(e) => update(w.id, { label: e.target.value })}
                style={{ flex: 2 }}
              />
              <select
                value={w.materialId}
                onChange={(e) => update(w.id, { materialId: e.target.value })}
              >
                {scenario.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                className="tiny danger"
                onClick={() => {
                  if (confirm('删除该授权窗口？'))
                    mutate((d) => {
                      d.windows = d.windows.filter((x) => x.id !== w.id);
                    });
                }}
              >
                删除
              </button>
            </div>
            <div className="win-grid">
              <label className="field">
                开始（当地；空=不限）
                <input
                  type="datetime-local"
                  value={w.start ? toLocalInputValue(toMs(w.start), region.timeZone) : ''}
                  onChange={(e) => editBoundary(w, 'start', e.target.value)}
                />
              </label>
              <label className="field">
                结束（当地；空=不限，结束瞬间即失效）
                <input
                  type="datetime-local"
                  value={w.end ? toLocalInputValue(toMs(w.end), region.timeZone) : ''}
                  onChange={(e) => editBoundary(w, 'end', e.target.value)}
                />
              </label>
              <div className="full chip-row">
                <span className="tz-note">授权渠道：</span>
                <label>
                  <input
                    type="checkbox"
                    checked={w.channelIds.length === 0}
                    onChange={(e) =>
                      update(w.id, { channelIds: e.target.checked ? [] : scenario.channels.map((c) => c.id) })
                    }
                  />
                  全部渠道
                </label>
                {scenario.channels.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={w.channelIds.length === 0 || w.channelIds.includes(c.id)}
                      disabled={w.channelIds.length === 0}
                      onChange={(e) => {
                        const set = new Set(
                          w.channelIds.length === 0
                            ? scenario.channels.map((x) => x.id)
                            : w.channelIds,
                        );
                        if (e.target.checked) set.add(c.id);
                        else set.delete(c.id);
                        update(w.id, { channelIds: [...set] });
                      }}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              {mat && mat.kind === 'regional' && mat.ownerRegionId && mat.ownerRegionId !== regionId && (
                <div className="full" style={{ color: 'var(--warn)', fontSize: 12 }}>
                  注意：该素材归属其他地区，通常不应在 {region.name} 建窗口
                </div>
              )}
            </div>
          </div>
        );
      })}
      {wins.length === 0 && <div className="empty-hint">{region.name} 暂无授权窗口。</div>}
    </div>
  );
}

/* ------------------------------ 替代链编辑 ------------------------------ */

function ChainEditor() {
  const { state, mutate } = useStore();
  const { scenario, regionId, segmentId } = state;
  const segment = scenario.segments.find((s) => s.id === segmentId)!;
  const schedule = segment.scheduleByRegion[regionId];
  const region = scenario.regions.find((r) => r.id === regionId)!;

  if (!schedule) {
    return (
      <div>
        <div className="empty-hint" style={{ marginBottom: 8 }}>
          {region.name} 尚未安排该段落。
        </div>
        <button
          onClick={() =>
            mutate((d) => {
              const seg = d.segments.find((s) => s.id === segmentId)!;
              seg.scheduleByRegion[regionId] = {
                start: d.span.start,
                end: d.span.end,
                chain: [d.materials[0].id],
              };
            })
          }
        >
          为 {region.name} 创建播出安排
        </button>
      </div>
    );
  }

  function setChain(next: string[]) {
    mutate((d) => {
      d.segments.find((s) => s.id === segmentId)!.scheduleByRegion[regionId].chain =
        next;
    });
  }

  function editTime(key: 'start' | 'end', raw: string) {
    try {
      const iso = localInputToIso(raw, region.timeZone);
      mutate((d) => {
        d.segments.find((s) => s.id === segmentId)!.scheduleByRegion[regionId][key] =
          iso;
      });
    } catch {
      /* ignore */
    }
  }

  const chainSet = new Set(schedule.chain);
  const candidates = scenario.materials.filter((m) => !chainSet.has(m.id));

  return (
    <div>
      <div className="win-grid" style={{ marginBottom: 12 }}>
        <label className="field">
          当地播出开始
          <input
            type="datetime-local"
            value={toLocalInputValue(toMs(schedule.start), region.timeZone)}
            onChange={(e) => editTime('start', e.target.value)}
          />
        </label>
        <label className="field">
          当地播出结束（结束瞬间即停播）
          <input
            type="datetime-local"
            value={toLocalInputValue(toMs(schedule.end), region.timeZone)}
            onChange={(e) => editTime('end', e.target.value)}
          />
        </label>
      </div>

      <div className="tz-note" style={{ marginBottom: 8 }}>
        替代链自上而下尝试：上一素材在「地区 + 渠道 + 时刻」任一不满足时，落到下一份素材。
      </div>

      {schedule.chain.map((mid, idx) => {
        const mat = scenario.materials.find((m) => m.id === mid);
        const duplicated = schedule.chain.indexOf(mid) !== idx;
        return (
          <div className="chain-editor-row" key={`${mid}-${idx}`}>
            <div className="ord">{idx + 1}</div>
            <div className="name">
              {mat ? mat.name : <span style={{ color: 'var(--err)' }}>缺失素材 {mid}（链已断裂）</span>}
              {duplicated && (
                <span className="kind-tag" style={{ color: 'var(--err)', marginLeft: 8 }}>
                  重复·循环
                </span>
              )}
            </div>
            <button
              className="tiny"
              disabled={idx === 0}
              onClick={() => {
                const next = [...schedule.chain];
                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                setChain(next);
              }}
            >
              ↑
            </button>
            <button
              className="tiny"
              disabled={idx === schedule.chain.length - 1}
              onClick={() => {
                const next = [...schedule.chain];
                [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                setChain(next);
              }}
            >
              ↓
            </button>
            <button
              className="tiny danger"
              onClick={() => setChain(schedule.chain.filter((_, i) => i !== idx))}
            >
              移除
            </button>
          </div>
        );
      })}

      <div className="chain-add-row">
        <select
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            setChain([...schedule.chain, e.target.value]);
            e.target.value = '';
          }}
        >
          <option value="">选择素材追加到链尾…</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
