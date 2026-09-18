import type { Evaluation } from '../core/types';
import { useStore } from '../state/store';
import { describeStep } from '../core/engine';
import { formatLocal, tzAbbr } from '../core/time';

const KIND_LABEL: Record<string, string> = {
  main: '主片',
  regional: '区域版',
  slate: '安全垫片',
};

function kindOf(scenarioMaterials: { id: string; kind: string }[], id: string) {
  return scenarioMaterials.find((m) => m.id === id)?.kind ?? '';
}

export function SelectionPanel({
  evaluation,
  segmentName,
}: {
  evaluation: Evaluation;
  segmentName: string;
}) {
  const { state } = useStore();
  const { scenario } = state;
  const region = scenario.regions.find((r) => r.id === evaluation.regionId)!;
  const channel = scenario.channels.find((c) => c.id === evaluation.channelId)!;
  const selected = scenario.materials.find(
    (m) => m.id === evaluation.selectedMaterialId,
  );

  const verdictClass = evaluation.blackout
    ? 'black'
    : selected?.kind === 'slate'
      ? 'slatev'
      : 'ok';

  return (
    <div className="panel">
      <h2>
        此刻选材 · {segmentName}
        <span style={{ marginLeft: 10 }}>
          <span className={`onair-pill ${evaluation.onAir ? 'live' : 'off'}`}>
            {evaluation.onAir ? '● 播出时段内' : '播出时段外'}
          </span>
        </span>
      </h2>

      <div className={`verdict ${verdictClass}`}>
        {evaluation.blackout ? (
          <>
            <strong>⬤ 黑屏</strong>
            <span className="badge">替代链走完仍无可用素材</span>
          </>
        ) : (
          <>
            <strong>✔ 最终播出：{selected?.name}</strong>
            {selected?.kind === 'slate' && (
              <span className="badge">已降级到安全垫片</span>
            )}
            {selected?.kind === 'regional' && (
              <span className="badge">区域版接力</span>
            )}
          </>
        )}
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: 'var(--text-dim)',
          marginBottom: 12,
        }}
      >
        视图：{region.name}（{region.timeZone}，当地{' '}
        {formatLocal(evaluation.atMs, region.timeZone)}） · 渠道：
        {channel.name}
        <br />
        选择规则：沿替代链自上而下，第一个「地区 + 渠道 + 时刻」全部命中的素材胜出；
        多窗口重叠时按开始最早、编号字典序确定性裁决。
      </div>

      <div className="path">
        {evaluation.steps.map((step, i) => {
          const kind = kindOf(scenario.materials, step.materialId);
          const cardClass =
            step.status === 'selected'
              ? 'selected'
              : step.status === 'slate'
                ? 'slate'
                : step.status === 'selected-overlap'
                  ? 'overlap'
                  : step.status === 'missing' || step.status === 'cycle'
                    ? 'bad'
                    : '';
          return (
            <div key={`${step.materialId}-${i}`}>
              {i > 0 && <div className="path-arrow">↓ 上一素材不可用，继续向下替换</div>}
              <div className="path-step">
                <div className="path-idx">{i + 1}</div>
                <div className={`path-card ${cardClass}`}>
                  <div className="mat">
                    {scenario.materials.find((m) => m.id === step.materialId)
                      ?.name ?? `缺失素材 ${step.materialId}`}
                    {kind && <span className="kind-tag">{KIND_LABEL[kind]}</span>}
                    {step.status === 'selected-overlap' && (
                      <span className="kind-tag" style={{ color: 'var(--warn)' }}>
                        窗口重叠×{step.activeWindowIds?.length}
                      </span>
                    )}
                  </div>
                  <div className="reason">
                    {describeStep(scenario, step, evaluation.atMs)}
                  </div>
                  {step.windowId && (
                    <div className="reason" style={{ fontFamily: 'var(--mono)' }}>
                      命中窗口：
                      {scenario.windows.find((w) => w.id === step.windowId)?.label ??
                        step.windowId}
                      {` · ${tzAbbr(evaluation.atMs, region.timeZone)}`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {evaluation.steps.length === 0 && (
          <div className="empty-hint">该地区没有此段落的播出安排与替代链。</div>
        )}
      </div>
    </div>
  );
}
