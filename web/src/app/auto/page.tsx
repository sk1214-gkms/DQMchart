'use client';
// 自動チャート生成: 目標モンスターから配合ツリーを逆算してReact Flowで描画
import { useCallback, useMemo, useState } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '@/components/MonsterNode';
import type { MonsterFlowNode } from '@/components/MonsterNode';
import { ChartImageButton } from '@/components/ChartImageButton';
import { edgeDefaults } from '@/components/edgeStyle';
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
import { findParentAlternatives } from '@/lib/engine/alternatives';
import { explainUnreachable } from '@/lib/engine/blockers';
import { PlanTree } from '@/components/PlanTree';
import type {
  BreedingMethod,
  BreedingPlan,
  BreedingRuleset,
  Monster,
  TitleData,
} from '@/lib/engine/types';

/** 配合手順の1ステップ。表示時に相方の代替候補を出せるよう構造で持つ */
type BreedStep = {
  childId: string;
  childName: string;
  parents: Array<{ id: string; name: string }>;
  method: BreedingMethod;
};

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

function buildFlow(
  plan: BreedingPlan,
  data: TitleData,
  orientation: Orientation,
  opts: { engine: BreedingRuleset; expanded: Set<string> },
) {
  const nodes: MonsterFlowNode[] = [];
  const edges: Edge[] = [];
  const leaves: Monster[] = []; // 実際に集める必要のあるモンスター（展開状態を反映）
  const steps: BreedStep[] = [];
  let seq = 0;
  let leafIndex = 0;

  // 親が手前（縦なら上、横なら左）。葉から順に並び位置を決め、子は親の中央に置く。
  // ancestors は循環展開を防ぐための祖先モンスターの集合。
  function walk(
    p: BreedingPlan,
    depth: number,
    ancestors: Set<string>,
  ): { id: string; across: number } {
    const id = `n${seq++}`;
    if (p.kind === 'wild') {
      // 直接入手できるモンスターでも、配合で作る手順を開いていればそちらを展開する
      const canExpand =
        !ancestors.has(p.monster.id) && opts.engine.planByBreeding(p.monster.id, data) !== null;
      if (canExpand && opts.expanded.has(p.monster.id)) {
        const sub = opts.engine.planByBreeding(p.monster.id, data);
        if (sub) return walk(sub, depth, new Set([...ancestors, p.monster.id]));
      }

      const across = leafIndex++;
      leaves.push(p.monster);
      nodes.push({
        id,
        type: 'monster',
        position: toPosition(across, depth, orientation),
        data: {
          monsterId: p.monster.id,
          label: p.monster.name,
          sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}\n${
            p.monster.acquisitionDetail ?? `${acquisitionLabel(p.monster.acquisition)}で入手`
          }${canExpand ? '\n▶ 押すと配合で作る手順を表示' : ''}`,
          familyColor: familyColor(p.monster.familyId),
          orientation,
          expandable: canExpand,
          status: 'wild',
        },
      });
      return { id, across };
    }

    // 4体配合は祖父母4体の手前に「任意の子」の中間ノードを2つ挟んで描く
    const quad = p.method === 'quad' && p.parents.length === 4;
    const parentDepth = quad ? depth + 2 : depth + 1;
    const nextAncestors = new Set([...ancestors, p.monster.id]);
    const placed = p.parents.map((parent) => walk(parent, parentDepth, nextAncestors));
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
            ...edgeDefaults,
          });
        }
        return { id: midId, across: midAcross };
      });
    }

    // 直接入手できるのに配合で表示しているノードは、押せば元に戻せる
    const isExpandedHere = p.monster.obtainable === true && opts.expanded.has(p.monster.id);

    nodes.push({
      id,
      type: 'monster',
      position: toPosition(across, depth, orientation),
      data: {
        monsterId: p.monster.id,
        label: p.monster.name,
        sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}\n${methodLabel(
          p.method,
        )}で作る${isExpandedHere ? '\n▼ 押すと直接入手に戻す' : ''}`,
        familyColor: familyColor(p.monster.familyId),
        orientation,
        expandable: isExpandedHere,
        status: 'ok',
      },
    });
    for (const parent of incoming) {
      edges.push({
        id: `e${parent.id}-${id}`,
        source: parent.id,
        target: id,
        ...edgeDefaults,
      });
    }

    // 手順は親を先に処理してから積むので、上流から順に並ぶ
    steps.push({
      childId: p.monster.id,
      childName: p.monster.name,
      parents: p.parents.map((x) => ({ id: x.monster.id, name: x.monster.name })),
      method: p.method,
    });
    return { id, across };
  }

  walk(plan, 0, new Set());
  return { nodes, edges, leaves, steps };
}

/**
 * 配合手順の1行。
 * 位階配合は条件さえ合えば相方を選べるので、「○○系の位階△△以下」のように
 * 条件で示し、具体的な候補は折りたたんで見られるようにする。
 */
function BreedStepLine({
  step,
  data,
  engine,
}: {
  step: BreedStep;
  data: TitleData;
  engine: BreedingRuleset;
}) {
  // 4体配合や特殊配合は組み合わせが決まっているので、そのまま名前で出す
  const fixedRecipe = step.method !== 'normal' || step.parents.length !== 2;

  const alternatives = useMemo(() => {
    if (fixedRecipe) return null;
    // 片方を固定したとき、もう片方に使えるモンスターを調べる
    const [a, b] = step.parents;
    const forB = findParentAlternatives(engine, data, step.childId, a.id);
    const forA = findParentAlternatives(engine, data, step.childId, b.id);
    // 選択肢が多いほうを「条件」として示すと分かりやすい
    return forB.candidates.length >= forA.candidates.length
      ? { fixed: a, flexible: forB }
      : { fixed: b, flexible: forA };
  }, [fixedRecipe, step, data, engine]);

  if (step.method === 'quad') {
    return (
      <span>
        {step.parents.map((p) => p.name).join(' × ')} の4体を祖父母にして2回配合し、その子同士を配合
        → <span className="font-semibold">{step.childName}</span>（4体配合）
      </span>
    );
  }

  const flexible = alternatives?.flexible;
  const canSummarize = flexible && flexible.candidates.length > 1 && flexible.summary;

  return (
    <span>
      {canSummarize ? (
        <>
          {alternatives.fixed.name} ×{' '}
          <span className="rounded bg-[#eef3fd] px-1.5 text-[var(--brand-700)]">
            {flexible.summary}
          </span>
        </>
      ) : (
        step.parents.map((p) => p.name).join(' × ')
      )}
      {' → '}
      <span className="font-semibold">{step.childName}</span>（{methodLabel(step.method)}）
      {canSummarize && (
        <details className="mt-0.5">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">
            使えるモンスター{flexible.candidates.length}種を見る
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {flexible.candidates.map((m) => (
              <span
                key={m.id}
                className="rounded border px-1.5 py-0.5 text-[11px]"
                style={{
                  background: familyBackground(m.familyId),
                  borderColor: familyColor(m.familyId),
                }}
              >
                {m.name}
                {m.tier !== undefined && (
                  <span className="ml-1 text-[var(--muted)]">位階{m.tier}</span>
                )}
              </span>
            ))}
          </div>
        </details>
      )}
    </span>
  );
}

/** 画像保存はReactFlowの状態を参照するため、ページ全体をProviderで包む */
export default function AutoPage() {
  return (
    <ReactFlowProvider>
      <AutoPageContent />
    </ReactFlowProvider>
  );
}

function AutoPageContent() {
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

  // 葉ノードを押して配合手順を開いたモンスター
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 配合手順の見せ方（ツリー＝親子関係が分かる／順番＝上から順に作業できる）
  const [stepView, setStepView] = useState<'tree' | 'list'>('tree');

  const result = useMemo(() => {
    if (!targetId) return null;
    const direct = engine.plan(targetId, data);
    const plan = forceBreeding && breedingPlan ? breedingPlan : direct;
    if (!plan) return { plan: null, flow: null };
    return { plan, flow: buildFlow(plan, data, orientation, { engine, expanded }) };
  }, [engine, data, targetId, orientation, forceBreeding, breedingPlan, expanded]);

  const toggleExpand = useCallback((_: unknown, node: MonsterFlowNode) => {
    if (!node.data.expandable || !node.data.monsterId) return;
    const id = node.data.monsterId;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 同じ配合を複数回行う場合は回数をまとめる
  const stepCounts = useMemo(() => {
    if (!result?.flow) return [];
    const counts = new Map<string, { step: BreedStep; count: number }>();
    for (const s of result.flow.steps) {
      const key = `${s.childId}|${s.parents.map((p) => p.id).join('|')}|${s.method}`;
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { step: s, count: 1 });
    }
    return Array.from(counts.values());
  }, [result]);

  // 最初に集める必要のある素材（配合ツリーの葉）を必要数つきで集計。展開状態を反映する
  const materials = useMemo(() => {
    if (!result?.flow) return [];
    const counts = new Map<string, { monster: Monster; count: number }>();
    for (const monster of result.flow.leaves) {
      const cur = counts.get(monster.id);
      if (cur) cur.count += 1;
      else counts.set(monster.id, { monster, count: 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [result]);

  const targetMonster = data.monsters.find((m) => m.id === targetId);

  // 作れないときは、なぜ作れないのかを説明する（調べても解決しない理由なのかを伝える）
  const blockReason = useMemo(
    () => (targetId && result && !result.plan ? explainUnreachable(engine, data, targetId) : null),
    [engine, data, targetId, result],
  );

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
          {blockReason?.kind === 'discontinued' ? (
            <>
              このモンスターは今から入手することができません。
              {blockReason.roots.some((m) => m.id === targetId)
                ? '配信・通信が終了しているためです。'
                : `配合の材料になる${blockReason.roots
                    .map((m) => m.name)
                    .join('・')}が、配信・通信の終了により入手できないためです。`}
            </>
          ) : blockReason?.kind === 'materials' ? (
            <>
              配合の材料になる{blockReason.roots.map((m) => m.name).join('・')}
              にたどり着けないため、手順を出せませんでした。
            </>
          ) : (
            <>このモンスターへの入手ルートが見つかりませんでした（データ未整備の可能性があります）。</>
          )}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--muted)]">図の向き</span>
                <OrientationToggle value={orientation} onChange={setOrientation} />
                <ChartImageButton
                  fileName={`${targetMonster?.name ?? 'chart'}_配合チャート`}
                />
              </div>
              <div className="h-[60vh] min-h-[300px] overflow-hidden rounded-xl border bg-white shadow-sm sm:h-[540px]" style={{ borderColor: 'var(--border)' }}>
                <ReactFlow
                  nodes={result.flow.nodes}
                  edges={result.flow.edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={toggleExpand}
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
              <p className="text-xs text-[var(--muted)]">
                「▶」が付いたモンスターは配合でも作れます。押すとその配合手順を開けます。
                <span className="sm:hidden">図は指でドラッグして移動、2本指でズームできます。</span>
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
                        <AcquisitionBadge kind={monster.acquisition} discontinued={monster.discontinued} />
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
                <span className="ml-auto inline-flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                  {(['tree', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setStepView(v)}
                      aria-pressed={stepView === v}
                      className={`min-h-9 px-3 text-xs font-medium transition ${
                        stepView === v
                          ? 'bg-[var(--brand-700)] text-white'
                          : 'bg-white text-[var(--muted)] hover:bg-[#f2f5fc]'
                      }`}
                    >
                      {v === 'tree' ? 'ツリー' : '順番'}
                    </button>
                  ))}
                </span>
              </h2>
              {stepView === 'tree' && result.plan.kind === 'breed' && (
                <PlanTree plan={result.plan} data={data} />
              )}
              <ol className={`flex-col gap-2 ${stepView === 'list' ? 'flex' : 'hidden'}`}>
                {stepCounts.map(({ step, count }, i) => (
                  <li
                    key={`${step.childId}-${i}`}
                    className="flex items-start gap-3 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef3fd] text-xs font-bold tabular-nums text-[var(--brand-700)]">
                      {i + 1}
                    </span>
                    <div className="flex-1 leading-relaxed">
                      <BreedStepLine step={step} data={data} engine={engine} />
                      {count > 1 && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
                          ×{count}回
                        </span>
                      )}
                    </div>
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
