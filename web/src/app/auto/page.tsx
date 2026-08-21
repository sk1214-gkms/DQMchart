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
import { useStoredValue } from '@/lib/useStoredValue';
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

/** 図のノードに入れる説明。長すぎるとノードが横に伸びて隣と重なるので短く切る */
function shortHow(text: string): string {
  const head = text.split(/[／/。]/)[0].trim() || text.trim();
  return head.length > 24 ? `${head.slice(0, 24)}…` : head;
}

function methodLabel(method: BreedingMethod): string {
  if (method === 'special') return '特殊配合';
  if (method === 'quad') return '4体配合';
  return '通常配合';
}

/**
 * 配合ツリーをフロー図の形にする。
 *
 * 同じモンスターは1つのノードにまとめる。手順の中で何度も出てくるモンスターを
 * そのたびに描くと、図が実際の倍以上に横に広がって1つ1つが読めなくなる
 * （マジェスドレアムは285個のノードになるが、実際のモンスターは133種しかない）。
 * まとめたぶん「何体必要か」は数で示す。
 */
function buildFlow(
  plan: BreedingPlan,
  data: TitleData,
  orientation: Orientation,
  opts: { engine: BreedingRuleset; expanded: Set<string>; expandAll: boolean },
) {
  /** モンスターごとの置き場所。depthは根からの最長距離（親が必ず手前に来るように） */
  type Slot = {
    plan: BreedingPlan;
    depth: number;
    uses: number;
    order: number;
  };
  const slots = new Map<string, Slot>();
  const leaves: Monster[] = []; // 実際に集める必要のあるモンスター（必要数だけ重複して入れる）
  const steps: BreedStep[] = [];
  let order = 0;

  // まず「どのモンスターを、どの親から作るか」だけを集める。深さはあとで決める。
  // モンスターをまとめると、別のルート経由で行き先が戻ってくる（循環する）ことがあり、
  // 見つけながら深さを押し下げていくと再帰が止まらなくなるため。
  const visit = (p: BreedingPlan, ancestors: Set<string>) => {
    // 直接入手できるモンスターでも、配合で作る手順を開いていればそちらを展開する
    let target = p;
    const openHere = opts.expandAll || opts.expanded.has(p.monster.id);
    if (p.kind === 'wild' && !ancestors.has(p.monster.id) && openHere) {
      const sub = opts.engine.planByBreeding(p.monster.id, data);
      if (sub) target = sub;
    }

    const id = target.monster.id;
    const found = slots.get(id);
    if (found) {
      found.uses += 1;
      if (target.kind !== 'breed') leaves.push(target.monster);
      return;
    }

    slots.set(id, { plan: target, depth: 0, uses: 1, order: order++ });
    if (target.kind !== 'breed') {
      leaves.push(target.monster);
      return;
    }
    const next = new Set([...ancestors, id]);
    target.parents.forEach((x) => visit(x, next));
    steps.push({
      childId: target.monster.id,
      childName: target.monster.name,
      parents: target.parents.map((x) => ({ id: x.monster.id, name: x.monster.name })),
      method: target.method,
    });
  };
  visit(plan, new Set());

  // 深さは「根からの最長距離」。親は必ず子より奥に置く。
  //
  // モンスターをまとめると、別ルート経由で先祖に戻る辺（逆流）ができることがある。
  // それを含めて最長距離を出すと深さがいくらでも伸びてしまうので、
  // まず根からたどって逆流する辺を外し、残った並び順で一度だけ押し下げる。
  const childrenOf = (slot: Slot): string[] =>
    slot.plan.kind === 'breed' ? slot.plan.parents.map((x) => x.monster.id) : [];
  const stepOf = (slot: Slot) =>
    slot.plan.kind === 'breed' && slot.plan.method === 'quad' ? 2 : 1;

  const rootId = plan.monster.id;
  const onStack = new Set<string>();
  const done = new Set<string>();
  const orderedIds: string[] = []; // 帰りがけ順。逆にすると親が後に来る並びになる
  const backEdges = new Set<string>();
  const sortStack: Array<{ id: string; next: number }> = [{ id: rootId, next: 0 }];
  onStack.add(rootId);
  while (sortStack.length) {
    const top = sortStack[sortStack.length - 1];
    const slot = slots.get(top.id);
    const kids = slot ? childrenOf(slot) : [];
    if (top.next < kids.length) {
      const kid = kids[top.next++];
      if (onStack.has(kid)) {
        backEdges.add(`${top.id}>${kid}`); // 先祖に戻る辺。深さの計算には使わない
      } else if (!done.has(kid) && slots.has(kid)) {
        onStack.add(kid);
        sortStack.push({ id: kid, next: 0 });
      }
      continue;
    }
    sortStack.pop();
    onStack.delete(top.id);
    done.add(top.id);
    orderedIds.push(top.id);
  }
  for (const id of orderedIds.reverse()) {
    const slot = slots.get(id);
    if (!slot) continue;
    const step = stepOf(slot);
    for (const kid of childrenOf(slot)) {
      if (backEdges.has(`${id}>${kid}`)) continue;
      const p = slots.get(kid);
      if (p && p.depth < slot.depth + step) p.depth = slot.depth + step;
    }
  }

  // 4体配合は祖父母4体と子の間に「この2体の子」を2つ挟む。
  // これも場所を取るので、モンスターと一緒に並べないと重なってしまう。
  type Item = { key: string; depth: number; order: number };
  const items: Item[] = [...slots.values()].map((s) => ({
    key: s.plan.monster.id,
    depth: s.depth,
    order: s.order,
  }));
  const midKeys = new Map<string, [string, string]>(); // 子のID → 中間ノード2つのキー
  for (const slot of slots.values()) {
    if (slot.plan.kind !== 'breed' || slot.plan.method !== 'quad') continue;
    if (slot.plan.parents.length !== 4) continue;
    const pairs: Array<[string, string]> = [
      [slot.plan.parents[0].monster.id, slot.plan.parents[1].monster.id],
      [slot.plan.parents[2].monster.id, slot.plan.parents[3].monster.id],
    ];
    const keys = pairs.map(([a, b], i) => {
      const key = `mid-${slot.plan.monster.id}-${i}`;
      // 祖父母2体の間に来るように並び順を決める
      const oa = slots.get(a)?.order ?? slot.order;
      const ob = slots.get(b)?.order ?? slot.order;
      items.push({ key, depth: slot.depth + 1, order: (oa + ob) / 2 });
      return key;
    });
    midKeys.set(slot.plan.monster.id, [keys[0], keys[1]]);
  }

  // 深さごとに横一列に並べる。並び順は最初に出てきた順にして、近い関係が隣に来るようにする
  const byDepth = new Map<number, Item[]>();
  for (const item of items) {
    const list = byDepth.get(item.depth);
    if (list) list.push(item);
    else byDepth.set(item.depth, [item]);
  }
  const widest = Math.max(...[...byDepth.values()].map((v) => v.length));
  const across = new Map<string, number>();
  for (const list of byDepth.values()) {
    list.sort((a, b) => a.order - b.order);
    const offset = (widest - list.length) / 2; // 各段を中央そろえにする
    list.forEach((item, i) => across.set(item.key, offset + i));
  }

  const nodes: MonsterFlowNode[] = [];
  const edges: Edge[] = [];
  const nodeIdOf = new Map<string, string>();
  for (const slot of slots.values()) {
    const m = slot.plan.monster;
    const id = `m-${m.id}`;
    nodeIdOf.set(m.id, id);
    const bred = slot.plan.kind === 'breed' ? slot.plan : null;
    const breed = bred !== null;
    const canExpand =
      !breed &&
      !opts.expandAll &&
      opts.engine.planByBreeding(m.id, data) !== null &&
      !opts.expanded.has(m.id);
    const isExpandedHere =
      breed && !opts.expandAll && m.obtainable === true && opts.expanded.has(m.id);
    const how = bred
      ? `${methodLabel(bred.method)}で作る`
      : shortHow(m.acquisitionDetail ?? `${acquisitionLabel(m.acquisition)}で入手`);
    const hint = canExpand
      ? '\n▶ 押すと配合で作る手順を表示'
      : isExpandedHere
        ? '\n▼ 押すと直接入手に戻す'
        : '';
    nodes.push({
      id,
      type: 'monster',
      position: toPosition(across.get(m.id) ?? 0, slot.depth, orientation),
      data: {
        monsterId: m.id,
        label: slot.uses > 1 ? `${m.name} ×${slot.uses}` : m.name,
        sub: `${m.rank}ランク・${familyName(data, m.familyId)}\n${how}${hint}`,
        familyColor: familyColor(m.familyId),
        orientation,
        expandable: canExpand || isExpandedHere,
        status: breed ? 'ok' : 'wild',
      },
    });
  }

  // 親 → 子 の線を張る。4体配合だけは「この2体の子」を挟む
  for (const slot of slots.values()) {
    if (slot.plan.kind !== 'breed') continue;
    const childId = nodeIdOf.get(slot.plan.monster.id) as string;
    const parents = slot.plan.parents.map((x) => nodeIdOf.get(x.monster.id) as string);
    let incoming = parents;
    const mids = midKeys.get(slot.plan.monster.id);
    if (mids && parents.length === 4) {
      incoming = [
        [parents[0], parents[1]],
        [parents[2], parents[3]],
      ].map((pair, i) => {
        const midId = mids[i];
        nodes.push({
          id: midId,
          type: 'monster',
          position: toPosition(across.get(midId) ?? 0, slot.depth + 1, orientation),
          data: { label: '（この2体の子）', sub: '種族は自由', orientation, status: 'warn' },
        });
        for (const gp of new Set(pair)) {
          edges.push({ id: `e-${gp}-${midId}`, source: gp, target: midId, ...edgeDefaults });
        }
        return midId;
      });
    }
    // 同じモンスターを2体使う配合（ピサロナイト×ピサロナイトなど）はノードをまとめた結果
    // 同じ線が2本になるので1本にする。必要な数はノードの「×N」で分かる
    for (const parent of new Set(incoming)) {
      edges.push({ id: `e-${parent}-${childId}`, source: parent, target: childId, ...edgeDefaults });
    }
  }

  // 手順は素材に近いほうから並べたいので、積んだ順を逆にする
  steps.reverse();
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
  // 選んだモンスターは保存する。スマホでタブが破棄されても選び直しにならないように
  const [targetId, setTargetId] = useStoredValue(
    `haigou-auto-target-${data.id}`,
    useCallback((v: string) => data.monsters.some((m) => m.id === v), [data]),
  );

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
  // 表示形式は覚えておく。既定を変えると「前の表示が無くなった」と見えてしまうため
  const [storedStepView, setStepView] = useStoredValue(
    'haigou-step-view',
    useCallback((v: string) => v === 'tree' || v === 'list', []),
  );
  const stepView = storedStepView || 'tree';
  // 配合で作れる素材も全部さかのぼるか。
  // 切ると「入手できるところ」で止まり、入れるとスカウトなどでしか
  // 手に入らないモンスターまで下がる
  const [storedExpandAll, setExpandAll] = useStoredValue(
    'haigou-expand-all',
    useCallback((v: string) => v === 'on' || v === 'off', []),
  );
  const expandAll = storedExpandAll === 'on';

  const result = useMemo(() => {
    if (!targetId) return null;
    const direct = engine.plan(targetId, data);
    const plan = forceBreeding && breedingPlan ? breedingPlan : direct;
    if (!plan) return { plan: null, flow: null };
    return {
      plan,
      flow: buildFlow(plan, data, orientation, { engine, expanded, expandAll }),
    };
  }, [engine, data, targetId, orientation, forceBreeding, breedingPlan, expanded, expandAll]);

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

            {/* 配合でも作れる素材をどこまで下げるか。
                切っていると「入手できるところ」で止まるので、
                実際にはスカウトしなくても配合で用意できる素材が葉に混ざる */}
            {result.plan.kind === 'breed' && (
              <label
                className="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={expandAll}
                  onChange={(e) => setExpandAll(e.target.checked ? 'on' : 'off')}
                />
                <span>
                  スカウトなどでしか手に入らないモンスターまでさかのぼる
                  <span className="block text-xs text-[var(--muted)]">
                    配合でも作れる素材をすべて配合の形にします。図は大きくなりますが、
                    本当に捕まえる必要があるモンスターだけが「まず集める素材」に残ります。
                  </span>
                </span>
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
                {expandAll ? 'まず捕まえる素材（配合では作れないもの）' : 'まず集める素材'}
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
                      {v === 'tree' ? 'ツリー図' : '番号順'}
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
