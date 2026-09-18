import { useState } from 'react';
import { appStore, useApp } from '../state/store';
import type { AssetKind, ChannelId, Doc, RegionId, RightsWindow } from '../domain/types';
import { ASSET_KIND_LABEL, CHANNELS, REGIONS, channelById, regionById } from '../domain/types';
import {
  addAsset,
  addWindow,
  nextAssetId,
  nextWindowId,
  removeAsset,
  removeWindow,
  setChain,
  updateWindow,
} from '../domain/edit';
import { localToUtcMs, toUtcIso, utcToLocalIso } from '../domain/time';

export default function Editors() {
  return (
    <div className="editors">
      <WindowEditor />
      <ChainEditor />
      <AssetManager />
    </div>
  );
}

/* ---------------- 授权窗口编辑 ---------------- */

function WindowEditor() {
  const s = useApp();
  const seg = s.doc.segments.find((x) => x.id === s.segmentId) ?? s.doc.segments[0];
  const wins = s.doc.windows
    .filter((w) => seg && w.segmentId === seg.id && w.region === s.region && w.channel === s.channel)
    .sort(
      (a, b) =>
        a.assetId.localeCompare(b.assetId) ||
        Date.parse(a.startUtc) - Date.parse(b.startUtc) ||
        a.id.localeCompare(b.id),
    );

  const onAdd = () => {
    if (!seg) return;
    const firstChainAsset = seg.chain.find((id) => s.doc.assets.some((a) => a.id === id));
    const w: RightsWindow = {
      id: nextWindowId(s.doc),
      segmentId: seg.id,
      assetId: firstChainAsset ?? s.doc.assets[0]?.id ?? '',
      region: s.region,
      channel: s.channel,
      startUtc: seg.startUtc,
      endUtc: seg.endUtc,
      priority: 1,
    };
    appStore.commitDoc(addWindow(s.doc, w));
  };

  return (
    <section className="editor">
      <h3>
        授权窗口
        <span className="muted">
          （{seg ? `${seg.name} · ${regionById(s.region).label} · ${channelById(s.channel).label}` : '无段落'}）
        </span>
      </h3>
      {wins.length === 0 && <div className="muted">当前组合暂无窗口，可点击下方新增。</div>}
      {wins.map((w) => (
        <WindowCard key={w.id} w={w} doc={s.doc} />
      ))}
      <button onClick={onAdd} disabled={s.doc.assets.length === 0}>
        ＋ 新增窗口
      </button>
    </section>
  );
}

function WindowCard({ w, doc }: { w: RightsWindow; doc: Doc }) {
  const iana = regionById(w.region).iana;
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const patch = (p: Partial<RightsWindow>) => appStore.commitDoc(updateWindow(doc, w.id, p));
  const invalid = Date.parse(w.endUtc) <= Date.parse(w.startUtc);

  return (
    <div className="wcard">
      <div className="wrow">
        <select value={w.assetId} onChange={(e) => patch({ assetId: e.target.value })} title="素材">
          {doc.assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {!doc.assets.some((a) => a.id === w.assetId) && <option value={w.assetId}>未知素材 {w.assetId}</option>}
        </select>
        <input
          className="prio"
          type="number"
          min={0}
          max={99}
          value={w.priority}
          title="优先级：重叠时高者胜出"
          onChange={(e) => patch({ priority: Number(e.target.value) || 0 })}
        />
        <button className="del" title="删除该窗口" onClick={() => appStore.commitDoc(removeWindow(doc, w.id))}>
          ✕
        </button>
      </div>
      <div className="wrow">
        <select value={w.region} onChange={(e) => patch({ region: e.target.value as RegionId })} title="地区">
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <select value={w.channel} onChange={(e) => patch({ channel: e.target.value as ChannelId })} title="渠道">
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <label className="field">
        开始（{regionById(w.region).label}本地，含）
        <input
          type="datetime-local"
          step={1}
          value={utcToLocalIso(Date.parse(w.startUtc), iana)}
          onChange={(e) => {
            if (e.target.value) patch({ startUtc: toUtcIso(localToUtcMs(e.target.value, iana)) });
          }}
        />
      </label>
      <label className="field">
        结束（{regionById(w.region).label}本地，不含）
        <input
          type="datetime-local"
          step={1}
          value={utcToLocalIso(Date.parse(w.endUtc), iana)}
          onChange={(e) => {
            if (e.target.value) patch({ endUtc: toUtcIso(localToUtcMs(e.target.value, iana)) });
          }}
        />
      </label>
      <input
        type="text"
        placeholder="备注（如：临时延授）"
        value={noteDraft ?? w.note ?? ''}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          if (noteDraft !== null && noteDraft !== (w.note ?? '')) {
            patch({ note: noteDraft || undefined });
          }
          setNoteDraft(null);
        }}
      />
      {invalid && <div className="field-warn">结束必须晚于开始：该窗口当前永不生效</div>}
    </div>
  );
}

/* ---------------- 替代链编辑 ---------------- */

function ChainEditor() {
  const s = useApp();
  const seg = s.doc.segments.find((x) => x.id === s.segmentId) ?? s.doc.segments[0];
  const [pick, setPick] = useState('');
  const assetById = new Map(s.doc.assets.map((a) => [a.id, a]));
  if (!seg) return null;
  const commit = (chain: string[]) => appStore.commitDoc(setChain(s.doc, seg.id, chain));

  const move = (i: number, d: -1 | 1) => {
    const c = [...seg.chain];
    const j = i + d;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    commit(c);
  };

  return (
    <section className="editor">
      <h3>
        替代链 <span className="muted">（{seg.name}，顺序即优先级）</span>
      </h3>
      {seg.chain.length === 0 && <div className="muted">链为空：该段落任何时刻都是空档。</div>}
      {seg.chain.map((id, i) => {
        const a = assetById.get(id);
        const dup = seg.chain.indexOf(id) !== i;
        return (
          <div key={`${id}-${i}`} className="chain-row">
            <span className="pos">{i + 1}</span>
            <span className={`chain-name ${a ? '' : 'missing'}`}>
              {a ? a.name : `⚠ 未知素材（${id}）— 链已断裂`}
            </span>
            {dup && <span className="badge cycle">循环</span>}
            <span className="chain-ops">
              <button onClick={() => move(i, -1)} disabled={i === 0} title="上移">
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === seg.chain.length - 1} title="下移">
                ↓
              </button>
              <button
                className="del"
                title="移除该环"
                onClick={() => commit(seg.chain.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </span>
          </div>
        );
      })}
      <div className="chain-add">
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">选择素材…</option>
          {s.doc.assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          disabled={!pick}
          onClick={() => {
            commit([...seg.chain, pick]);
            setPick('');
          }}
        >
          添加到链尾
        </button>
      </div>
      <div className="muted small">
        顺序即优先级：通常为主片 → 区域版 → 安全垫片。重复添加同一素材会构成循环；删除素材后其引用会断裂。
      </div>
    </section>
  );
}

/* ---------------- 素材库 ---------------- */

function AssetManager() {
  const s = useApp();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('regional');

  const onAdd = () => {
    const id = nextAssetId(s.doc);
    appStore.commitDoc(
      addAsset(s.doc, { id, name: name.trim() || `自定义素材 ${id.replace('ast-custom-', '')}`, kind }),
    );
    setName('');
  };

  return (
    <section className="editor">
      <h3>素材库</h3>
      {s.doc.assets.map((a) => {
        const winCount = s.doc.windows.filter((w) => w.assetId === a.id).length;
        const chainRefs = s.doc.segments.filter((seg) => seg.chain.includes(a.id)).length;
        return (
          <div key={a.id} className="asset-row">
            <span className={`kind-dot kind-${a.kind}`} />
            <span className="asset-name">{a.name}</span>
            <span className="muted">
              {ASSET_KIND_LABEL[a.kind]} · {winCount} 个窗口 · {chainRefs} 条链引用
            </span>
            <button
              className="del"
              onClick={() => {
                if (
                  window.confirm(
                    `删除「${a.name}」将同时移除其 ${winCount} 个授权窗口；\n替代链中的引用会保留并形成断裂（用于演练断裂场景）。确认删除？`,
                  )
                ) {
                  appStore.commitDoc(removeAsset(s.doc, a.id));
                }
              }}
            >
              删除
            </button>
          </div>
        );
      })}
      <div className="asset-add">
        <input
          type="text"
          placeholder="新素材名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
          {(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button onClick={onAdd}>添加</button>
      </div>
    </section>
  );
}
