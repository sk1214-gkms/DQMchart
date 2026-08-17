'use client';
// 自動チャート生成: 目標モンスターから配合ツリーを逆算してReact Flowで描画
import { useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '@/components/MonsterNode';
import type { MonsterFlowNode } from '@/components/MonsterNode';
import { MonsterPicker } from '@/components/MonsterPicker';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';
import type { BreedingMethod, BreedingPlan, TitleData } from '@/lib/engine/types';

const X_GAP = 200;
const Y_GAP = 140;

function familyName(data: TitleData, familyId: string): string {
  return data.families.find((f) => f.id === familyId)?.name ?? familyId;
}

function methodLabel(method: BreedingMethod): string {
  if (method === 'special') return '特殊配合';
  if (method === 'quad') return '4体配合';
  return '通常配合';
}

function buildFlow(plan: BreedingPlan, data: TitleData) {
  const nodes: MonsterFlowNode[] = [];
  const edges: Edge[] = [];
  let seq = 0;
  let leafX = 0;

  // 親を上・子を下に配置。葉（野生）から再帰的にx座標を決め、子は親の中央に置く。
  function walk(p: BreedingPlan, depth: number): { id: string; x: number } {
    const id = `n${seq++}`;
    if (p.kind === 'wild') {
      const x = leafX * X_GAP;
      leafX += 1;
      nodes.push({
        id,
        type: 'monster',
        position: { x, y: -depth * Y_GAP },
        data: {
          label: p.monster.name,
          sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}・野生で入手`,
          status: 'wild',
        },
      });
      return { id, x };
    }

    // 4体配合は祖父母4体の下に「任意の子」の中間ノードを2つ挟んで描く
    const quad = p.method === 'quad' && p.parents.length === 4;
    const parentDepth = quad ? depth + 2 : depth + 1;
    const placed = p.parents.map((parent) => walk(parent, parentDepth));
    const x = placed.reduce((s, c) => s + c.x, 0) / placed.length;

    let incoming = placed;
    if (quad) {
      incoming = [
        [placed[0], placed[1]],
        [placed[2], placed[3]],
      ].map((pair) => {
        const midId = `n${seq++}`;
        const midX = (pair[0].x + pair[1].x) / 2;
        nodes.push({
          id: midId,
          type: 'monster',
          position: { x: midX, y: -(depth + 1) * Y_GAP },
          data: { label: '（この2体の子）', sub: '種族は自由', status: 'warn' },
        });
        for (const gp of pair) {
          edges.push({
            id: `e${gp.id}-${midId}`,
            source: gp.id,
            target: midId,
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        }
        return { id: midId, x: midX };
      });
    }

    nodes.push({
      id,
      type: 'monster',
      position: { x, y: -depth * Y_GAP },
      data: {
        label: p.monster.name,
        sub: `${p.monster.rank}ランク・${familyName(data, p.monster.familyId)}・${methodLabel(
          p.method,
        )}`,
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
    return { id, x };
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

  const result = useMemo(() => {
    if (!targetId) return null;
    const plan = getRuleset(data.ruleset).plan(targetId, data);
    if (!plan) return { plan: null, flow: null, steps: [] as string[] };
    const steps: string[] = [];
    collectSteps(plan, steps);
    return { plan, flow: buildFlow(plan, data), steps };
  }, [data, targetId]);

  // 同じ配合を複数回行う場合は回数をまとめる
  const stepCounts = useMemo(() => {
    if (!result) return [];
    const counts = new Map<string, number>();
    for (const s of result.steps) counts.set(s, (counts.get(s) ?? 0) + 1);
    return Array.from(counts.entries());
  }, [result]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">自動チャート生成</h1>
      <div className="max-w-sm">
        <MonsterPicker data={data} value={targetId} onChange={setTargetId} label="目標モンスター" />
      </div>

      {!result ? (
        <p className="text-sm text-zinc-500">
          目標モンスターを選ぶと、野生で仲間にできるモンスターから始まる配合手順を逆算します。
        </p>
      ) : !result.plan ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          このモンスターへの入手ルートが見つかりませんでした（サンプルデータ未整備の可能性があります）。
        </p>
      ) : (
        <>
          {result.plan.kind === 'wild' ? (
            <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              このモンスターは野生で仲間にできます。配合は不要です。
            </p>
          ) : (
            <p className="text-sm text-zinc-600">
              必要な配合回数: <span className="font-semibold">{result.plan.cost}回</span>
            </p>
          )}

          {result.flow && result.flow.nodes.length > 1 && (
            <div className="h-[540px] rounded-lg border border-zinc-200 bg-white shadow-sm">
              <ReactFlow
                nodes={result.flow.nodes}
                edges={result.flow.edges}
                nodeTypes={nodeTypes}
                fitView
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          )}

          {stepCounts.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">配合手順</h2>
              <ol className="flex list-decimal flex-col gap-1 pl-6 text-sm">
                {stepCounts.map(([step, count]) => (
                  <li key={step}>
                    {step}
                    {count > 1 && (
                      <span className="ml-1 font-semibold text-amber-700">×{count}回</span>
                    )}
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
