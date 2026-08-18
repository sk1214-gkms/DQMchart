'use client';
// 自動チャート生成: 目標モンスターから配合ツリーを逆算してReact Flowで描画
import { useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '@/components/MonsterNode';
import type { MonsterFlowNode } from '@/components/MonsterNode';
import { MonsterPicker } from '@/components/MonsterPicker';
import {
  AcquisitionBadge,
  FamilyMark,
  RankText,
  acquisitionLabel,
  familyBackground,
  familyColor,
  familyName,
} from '@/components/MonsterBadges';
import { OrientationToggle, useOrientation } from '@/components/Orientation';
import type { Orientation } from '@/components/Orientation';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';
import type { BreedingMethod, BreedingPlan, Monster, TitleData } from '@/lib/engine/types';

// 縦向きは葉が横に並び深さが縦方向、横向きはその逆になる
const GAPS: Record<Orientation, { across: number; depth: number }> = {
  vertical: { across: 200, depth: 150 },
  horizontal: { across: 96, depth: 260 },
};

/** 並び位置と深さを、向きに応じた実際の座標に変換する */
function toPosition(across: number, depth: number, orientation: Orientation) {
  const gap = GAPS[orientation];
  return orientation === 'vertical'
    ? { x: across * gap.across, y: -depth * gap.depth }
    : { x: -depth * gap.depth, y: across * gap.across };
}

function methodLabel(method: BreedingMethod): string {
  if (method === 'special') return '特殊配合';
  if (method === 'quad') return '4体配合';
  return '通常配合';
}

function buildFlow(plan: BreedingPlan, data: TitleData, orientation: Orientation) {
  const nodes: MonsterFlowNode[] = [];
  const edges: Edge[] = [];
  let seq = 0;
  let leafIndex = 0;

  // 親が手前（縦なら上、横なら左）。葉から順に並び位置を決め、子は親の中央に置く。
  function walk(p: BreedingPlan, depth: number): { id: string; across: number } {
    const id = `n${seq++}`;
    if (p.kind === 'wild') {
      const across = leafIndex++;
      nodes.push({
        id,
        type: 'monster',
        position: toPosition(across, depth, orientation),
        data: {
          label: p.monster.name,
          sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}\n${
            p.monster.acquisitionDetail ?? `${acquisitionLabel(p.monster.acquisition)}で入手`
          }`,
          familyColor: familyColor(p.monster.familyId),
          orientation,
          status: 'wild',
        },
      });
      return { id, across };
    }

    // 4体配合は祖父母4体の手前に「任意の子」の中間ノードを2つ挟んで描く
    const quad = p.method === 'quad' && p.parents.length === 4;
    const parentDepth = quad ? depth + 2 : depth + 1;
    const placed = p.parents.map((parent) => walk(parent, parentDepth));
    const across = placed.reduce((s, c) => s + c.across, 0) / placed.length;

    let incoming = placed;
    if (quad) {
      incoming = [
        [placed[0], placed[1]],
        [placed[2], placed[3]],
      ].map((pair) => {
        const midId = `n${seq++}`;
        const midAcross = (pair[0].across + pair[1].across) / 2;
        nodes.push({
          id: midId,
          type: 'monster',
          position: toPosition(midAcross, depth + 1, orientation),
          data: { label: '（この2体の子）', sub: '種族は自由', orientation, status: 'warn' },
        });
        for (const gp of pair) {
          edges.push({
            id: `e${gp.id}-${midId}`,
            source: gp.id,
            target: midId,
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        }
        return { id: midId, across: midAcross };
      });
    }

    nodes.push({
      id,
      type: 'monster',
      position: toPosition(across, depth, orientation),
      data: {
        label: p.monster.name,
        sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}\n${methodLabel(
          p.method,
        )}で作る`,
        familyColor: familyColor(p.monster.familyId),
        orientation,
        status: 'ok',
      },
    });
    for (const parent of incoming) {
      edges.push({
        id: `e${parent.id}-${id}`,
        source: parent.id,
        target: id,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
    return { id, across };
  }

  walk(plan, 0);
  return { nodes, edges };
}

function collectSteps(plan: BreedingPlan, out: string[]): void {
  if (plan.kind !== 'breed') return;
  for (const parent of plan.parents) collectSteps(parent, out);
  const parents = plan.parents.map((p) => p.monster.name).join(' × ');
  if (plan.method === 'quad') {
    out.push(
      `${parents} の4体を祖父母にして2回配合し、その子同士を配合 → ${plan.monster.name}（4体配合）`,
    );
    return;
  }
  out.push(`${parents} → ${plan.monster.name}（${methodLabel(plan.method)}）`);
}

export default function AutoPage() {
  const data = useTitleData();
  const [targetId, setTargetId] = useState('');

  const [orientation, setOrientation] = useOrientation();
  // 直接入手できるモンスターでも配合ルートを見たいときに切り替える
  const [forceBreeding, setForceBreeding] = useState(false);

  const engine = useMemo(() => getRuleset(data.ruleset), [data.ruleset]);

  /** 目標が直接入手できる場合でも、配合で作る方法があるか */
  const breedingPlan = useMemo(
    () => (targetId ? engine.planByBreeding(targetId, data) : null),
    [engine, data, targetId],
  );

  const result = useMemo(() => {
    if (!targetId) return null;
    const direct = engine.plan(targetId, data);
    const plan = forceBreeding && breedingPlan ? breedingPlan : direct;
    if (!plan) return { plan: null, flow: null, steps: [] as string[] };
    const steps: string[] = [];
    collectSteps(plan, steps);
    return { plan, flow: buildFlow(plan, data, orientation), steps };
  }, [engine, data, targetId, orientation, forceBreeding, breedingPlan]);

  // 同じ配合を複数回行う場合は回数をまとめる
  const stepCounts = useMemo(() => {
    if (!result) return [];
    const counts = new Map<string, number>();
    for (const s of result.steps) counts.set(s, (counts.get(s) ?? 0) + 1);
    return Array.from(counts.entries());
  }, [result]);

  // 最初に集める必要のある素材（配合ツリーの葉）を必要数つきで集計
  const materials = useMemo(() => {
    if (!result?.plan) return [];
    const counts = new Map<string, { monster: Monster; count: number }>();
    const walk = (p: BreedingPlan): void => {
      if (p.kind === 'wild') {
        const cur = counts.get(p.monster.id);
        if (cur) cur.count += 1;
        else counts.set(p.monster.id, { monster: p.monster, count: 1 });
        return;
      }
      p.parents.forEach(walk);
    };
    walk(result.plan);
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [result]);

  const targetMonster = data.monsters.find((m) => m.id === targetId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">自動チャート生成</h1>
      <div className="card max-w-sm">
        <MonsterPicker data={data} value={targetId} onChange={setTargetId} label="目標モンスター" />
      </div>

      {!result ? (
        <p className="text-sm text-[var(--muted)]">
          目標モンスターを選ぶと、配合なしで手に入るモンスター（野生・タマゴ・イベント）から始まる配合手順を逆算します。
        </p>
      ) : !result.plan ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          このモンスターへの入手ルートが見つかりませんでした（データ未整備の可能性があります）。
        </p>
      ) : (
        <>
          <div className="card flex flex-wrap items-center gap-x-4 gap-y-2">
            {targetMonster && (
              <div className="flex items-center gap-2.5">
                <FamilyMark familyId={targetMonster.familyId} size="lg" />
                <div>
                  <span className="text-lg font-bold">{targetMonster.name}</span>
                  <div className="flex items-center gap-1.5">
                    <RankText rank={targetMonster.rank} />
                    <span className="text-xs text-[var(--muted)]">
                      {familyName(data, targetMonster.familyId)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {result.plan.kind === 'wild' ? (
              <p className="text-sm text-[var(--status-info)]">
                配合不要で入手できます
                {result.plan.monster.acquisitionDetail
                  ? `（${result.plan.monster.acquisitionDetail}）`
                  : `（${acquisitionLabel(result.plan.monster.acquisition)}）`}
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                必要な配合回数
                <span className="ml-1.5 text-xl font-bold tabular-nums text-[var(--brand-700)]">
                  {result.plan.cost}
                </span>
                回
              </p>
            )}

            {/* 直接入手できるモンスターでも配合で作れるなら、そちらのルートも見られるようにする */}
            {targetMonster?.obtainable && breedingPlan && (
              <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={forceBreeding}
                  onChange={(e) => setForceBreeding(e.target.checked)}
                />
                配合で作る手順を見る（{breedingPlan.cost}回の配合で作れます）
              </label>
            )}
          </div>

          {result.flow && result.flow.nodes.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--muted)]">図の向き</span>
                <OrientationToggle value={orientation} onChange={setOrientation} />
              </div>
              <div className="h-[60vh] min-h-[300px] overflow-hidden rounded-xl border bg-white shadow-sm sm:h-[540px]" style={{ borderColor: 'var(--border)' }}>
                <ReactFlow
                  nodes={result.flow.nodes}
                  edges={result.flow.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  nodesConnectable={false}
                  nodesDraggable={false}
                  minZoom={0.1}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              <p className="text-xs text-[var(--muted)] sm:hidden">
                チャートは指でドラッグして移動、2本指でズームできます
              </p>
            </div>
          )}

          {materials.length > 0 && result.plan.kind === 'breed' && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <span aria-hidden className="text-[var(--brand-500)]">
                  ①
                </span>
                まず集める素材
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {materials.map(({ monster, count }) => (
                  <li
                    key={monster.id}
                    className="flex items-start gap-2.5 rounded-lg border p-2.5 shadow-sm"
                    style={{
                      background: familyBackground(monster.familyId),
                      borderColor: familyColor(monster.familyId),
                    }}
                  >
                    <FamilyMark familyId={monster.familyId} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{monster.name}</span>
                        {count > 1 && (
                          <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
                            ×{count}体
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RankText rank={monster.rank} />
                        <span className="text-xs text-[var(--muted)]">
                          {familyName(data, monster.familyId)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <AcquisitionBadge kind={monster.acquisition} />
                        {monster.acquisitionDetail && (
                          <span className="text-[11px] text-[var(--muted)]">
                            {monster.acquisitionDetail}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stepCounts.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <span aria-hidden className="text-[var(--brand-500)]">
                  ②
                </span>
                配合手順
              </h2>
              <ol className="flex flex-col gap-2">
                {stepCounts.map(([step, count], i) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef3fd] text-xs font-bold tabular-nums text-[var(--brand-700)]">
                      {i + 1}
                    </span>
                    <span className="flex-1 leading-relaxed">
                      {step}
                      {count > 1 && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
                          ×{count}回
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
