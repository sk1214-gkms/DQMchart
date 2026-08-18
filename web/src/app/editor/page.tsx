'use client';
// 手動チャートエディタ: モンスターを配置して親→子を線でつなぐ。
// 親2体がそろったノードは配合ルールエンジンで検証し、色で結果を表示する。
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';
import type { Connection, Edge, EdgeChange, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '@/components/MonsterNode';
import type { MonsterFlowNode, MonsterNodeStatus } from '@/components/MonsterNode';
import { MonsterPicker } from '@/components/MonsterPicker';
import { FamilyMark, familyBackground, familyColor } from '@/components/MonsterBadges';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';
import {
  getChartsServerSnapshot,
  getChartsSnapshot,
  localChartStore,
  parseCharts,
  subscribeCharts,
} from '@/lib/storage';
import type { SavedChart } from '@/lib/storage';

export default function EditorPage() {
  const data = useTitleData();
  const engine = useMemo(() => getRuleset(data.ruleset), [data.ruleset]);

  const [nodes, setNodes] = useState<MonsterFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [pickId, setPickId] = useState('');
  const [parentAId, setParentAId] = useState('');
  const [parentBId, setParentBId] = useState('');
  const [chartId, setChartId] = useState<string | null>(null);
  const [chartName, setChartName] = useState('');

  // 「配合を追加」で選んだ親2体から生まれる子の候補
  const childCandidates = useMemo(() => {
    const a = data.monsters.find((m) => m.id === parentAId);
    const b = data.monsters.find((m) => m.id === parentBId);
    if (!a || !b) return null;
    return engine.candidates(a, b, data);
  }, [data, engine, parentAId, parentBId]);

  const chartsSnapshot = useSyncExternalStore(
    subscribeCharts,
    getChartsSnapshot,
    getChartsServerSnapshot,
  );
  const saved = useMemo(() => parseCharts(chartsSnapshot, data.id), [chartsSnapshot, data.id]);

  const onNodesChange = useCallback(
    (changes: NodeChange<MonsterFlowNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );
  const onConnect = useCallback((conn: Connection) => {
    if (conn.source === conn.target) return;
    setEdges((es) => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, es));
  }, []);

  const addMonster = () => {
    const m = data.monsters.find((x) => x.id === pickId);
    if (!m) return;
    const fam = data.families.find((f) => f.id === m.familyId)?.name ?? m.familyId;
    setNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'monster',
        position: { x: 60 + (ns.length % 5) * 210, y: 60 + Math.floor(ns.length / 5) * 150 },
        data: {
          monsterId: m.id,
          label: m.name,
          sub: `${m.rank}ランク・${fam}`,
          familyColor: familyColor(m.familyId),
          status: 'none',
        },
      },
    ]);
  };

  // 各ノードの検証: 親0体=野生なら青 / 親2体=エンジン判定で緑・赤 / それ以外=黄
  // 親2体で成立しない場合でも、祖父母4体が揃っていれば4体配合として判定する
  const statusMap = useMemo(() => {
    const monsterOfNode = (nodeId: string | undefined) => {
      const src = nodes.find((n) => n.id === nodeId);
      return data.monsters.find((x) => x.id === src?.data.monsterId);
    };
    const parentNodeIds = (nodeId: string) =>
      edges.filter((e) => e.target === nodeId).map((e) => e.source);

    const map = new Map<string, MonsterNodeStatus>();
    for (const node of nodes) {
      const m = data.monsters.find((x) => x.id === node.data.monsterId);
      if (!m) {
        map.set(node.id, 'none');
        continue;
      }
      const parentIds = parentNodeIds(node.id);
      if (parentIds.length === 0) {
        map.set(node.id, m.obtainable ? 'wild' : 'none');
        continue;
      }
      if (parentIds.length !== 2) {
        map.set(node.id, 'warn');
        continue;
      }
      const parents = parentIds.map(monsterOfNode);
      if (!parents[0] || !parents[1]) {
        map.set(node.id, 'warn');
        continue;
      }
      if (engine.candidates(parents[0], parents[1], data).some((c) => c.child.id === m.id)) {
        map.set(node.id, 'ok');
        continue;
      }
      const grandparents = parentIds
        .flatMap((pid) => parentNodeIds(pid))
        .map(monsterOfNode)
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      const quadOk =
        grandparents.length === 4 &&
        engine.quadCandidates(grandparents, data).some((c) => c.child.id === m.id);
      map.set(node.id, quadOk ? 'ok' : 'ng');
    }
    return map;
  }, [nodes, edges, data, engine]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: statusMap.get(n.id) ?? ('none' as MonsterNodeStatus) },
      })),
    [nodes, statusMap],
  );

  const saveChart = () => {
    const id = chartId ?? crypto.randomUUID();
    const name = chartName.trim() || '無題のチャート';
    localChartStore.save({
      id,
      titleId: data.id,
      name,
      nodes: nodes.map((n) => ({
        id: n.id,
        monsterId: n.data.monsterId ?? '',
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      updatedAt: new Date().toISOString(),
    });
    setChartId(id);
    setChartName(name);
  };

  const loadChart = (c: SavedChart) => {
    setChartId(c.id);
    setChartName(c.name);
    setNodes(
      c.nodes.flatMap((sn) => {
        const m = data.monsters.find((x) => x.id === sn.monsterId);
        if (!m) return [];
        const fam = data.families.find((f) => f.id === m.familyId)?.name ?? m.familyId;
        return [
          {
            id: sn.id,
            type: 'monster' as const,
            position: { x: sn.x, y: sn.y },
            data: {
              monsterId: m.id,
              label: m.name,
              sub: `${m.rank}ランク・${fam}`,
              familyColor: familyColor(m.familyId),
              status: 'none' as MonsterNodeStatus,
            },
          },
        ];
      }),
    );
    setEdges(
      c.edges.map((se) => ({
        id: se.id,
        source: se.source,
        target: se.target,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    );
  };

  const newChart = () => {
    setChartId(null);
    setChartName('');
    setNodes([]);
    setEdges([]);
  };

  const removeChart = (chart: SavedChart) => {
    if (!window.confirm(`「${chart.name}」を削除します。よろしいですか？`)) return;
    localChartStore.remove(chart.id);
    if (chart.id === chartId) setChartId(null);
  };

  /** 親2体から選んだ子を、線でつないだ状態でまとめて置く（ドラッグ操作が不要な導線） */
  const addBreeding = (childId: string) => {
    const parentA = data.monsters.find((m) => m.id === parentAId);
    const parentB = data.monsters.find((m) => m.id === parentBId);
    const child = data.monsters.find((m) => m.id === childId);
    if (!parentA || !parentB || !child) return;

    // 既に置かれているノードの下に新しい組を積む
    const baseY = nodes.length
      ? Math.max(...nodes.map((n) => n.position.y)) + 190
      : 40;
    const toNode = (m: (typeof data.monsters)[number], x: number, y: number): MonsterFlowNode => ({
      id: crypto.randomUUID(),
      type: 'monster',
      position: { x, y },
      data: {
        monsterId: m.id,
        label: m.name,
        sub: `${m.rank}ランク・${data.families.find((f) => f.id === m.familyId)?.name ?? m.familyId}`,
        familyColor: familyColor(m.familyId),
        status: 'none',
      },
    });

    const nodeA = toNode(parentA, 40, baseY);
    const nodeB = toNode(parentB, 260, baseY);
    const nodeChild = toNode(child, 150, baseY + 130);
    setNodes((ns) => [...ns, nodeA, nodeB, nodeChild]);
    setEdges((es) => [
      ...es,
      ...[nodeA, nodeB].map((p) => ({
        id: `e-${p.id}-${nodeChild.id}`,
        source: p.id,
        target: nodeChild.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    ]);
  };

  // スマホにはDeleteキーが無いので、選択したノード・線をボタンで消せるようにする
  const selectedCount =
    nodes.filter((n) => n.selected).length + edges.filter((e) => e.selected).length;

  const deleteSelected = () => {
    const removedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) =>
      es.filter(
        (e) => !e.selected && !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target),
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">手動チャートエディタ</h1>

      {/* スマホではキャンバスを先に出す（操作パネルが先だとキャンバスまで遠い） */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="order-1 flex flex-col gap-2 lg:order-2 lg:flex-1">
          <div
            className="relative h-[55vh] min-h-[300px] overflow-hidden rounded-xl border bg-white shadow-sm lg:h-[600px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView={nodes.length > 0}
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>

            {/* キャンバスが空のときだけ使い方を重ねて表示する */}
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
                <div className="max-w-md rounded-xl border bg-white/95 p-4 shadow-md" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="font-bold">使い方</h2>
                  <ol className="mt-2 flex flex-col gap-2 text-sm">
                    {[
                      '左の「配合を追加」で親2体を選ぶと、生まれる子の候補が出ます。候補を押すと親2体と子が線でつながった状態で置かれます。',
                      '自分で組みたいときは「モンスターを追加」で好きな数だけ置き、親の下の丸から子の上の丸へドラッグして線をつなぎます。',
                      '子の枠が緑になれば配合成立、赤ならその親からは作れません。',
                    ].map((text, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef3fd] text-xs font-bold text-[var(--brand-700)]">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed text-[var(--muted)]">{text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={deleteSelected}
              disabled={selectedCount === 0}
              className="btn btn-outline text-sm text-red-600"
            >
              選択中を削除{selectedCount > 0 && `（${selectedCount}）`}
            </button>
            <span className="text-xs text-[var(--muted)]">
              ノードや線をタップして選択 → 削除（パソコンではDeleteキーでも可）
            </span>
          </div>

          <p className="text-xs text-[var(--muted)]">
            モンスターの下側の丸から、子にしたいモンスターの上側の丸へドラッグすると配合線がつながります（親2体→子）。
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            {[
              { color: 'bg-green-500', label: '配合成立' },
              { color: 'bg-red-500', label: 'この親からは作れない' },
              { color: 'bg-amber-500', label: '親が2体そろっていない' },
              { color: 'bg-sky-400', label: '親を繋がず直接入手する（野生・タマゴ・イベント）' },
              { color: 'bg-zinc-300', label: '配合が必要（親を繋ぐと判定します）' },
            ].map((item) => (
              <li key={item.label}>
                <span className={`mr-1 inline-block h-2 w-2 rounded-full ${item.color}`} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <aside className="order-2 flex w-full flex-col gap-4 lg:order-1 lg:w-80">
          <section className="card p-3">
            <h2 className="mb-2 text-sm font-bold">配合を追加</h2>
            <p className="mb-2 text-[11px] leading-relaxed text-[var(--muted)]">
              親2体を選ぶと生まれる子の候補が出ます。候補を押すと、線でつながった状態で置かれます。
            </p>
            <div className="flex flex-col gap-2">
              <MonsterPicker data={data} value={parentAId} onChange={setParentAId} label="親①" />
              <MonsterPicker data={data} value={parentBId} onChange={setParentBId} label="親②" />
            </div>

            {childCandidates !== null && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold">
                  生まれる子{childCandidates.length > 0 && `（${childCandidates.length}件）`}
                </h3>
                {childCandidates.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    この組み合わせから生まれる子はデータにありません。
                  </p>
                ) : (
                  <ul className="mt-1 flex max-h-60 flex-col gap-1 overflow-y-auto">
                    {childCandidates.map((c, i) => (
                      <li key={`${c.child.id}-${c.method}-${i}`}>
                        <button
                          onClick={() => addBreeding(c.child.id)}
                          className="flex w-full min-h-11 items-center gap-2 rounded-lg border px-2 text-left transition hover:shadow"
                          style={{
                            background: familyBackground(c.child.familyId),
                            borderColor: familyColor(c.child.familyId),
                          }}
                        >
                          <FamilyMark familyId={c.child.familyId} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {c.child.name}
                            </span>
                            <span className="text-[11px] text-[var(--muted)]">
                              {c.child.rank}ランク
                              {c.method === 'special' && '・特殊配合'}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-bold text-[var(--brand-700)]">
                            ＋
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="card p-3">
            <MonsterPicker
              data={data}
              value={pickId}
              onChange={setPickId}
              label="モンスターを1体だけ追加"
            />
            <button onClick={addMonster} disabled={!pickId} className="btn btn-primary mt-2 w-full">
              キャンバスに追加
            </button>
          </section>

          <section className="card p-3">
            <h2 className="mb-2 text-sm font-semibold">チャートの保存</h2>
            <input
              className="field"
              placeholder="チャート名"
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button onClick={saveChart} className="btn btn-accent flex-1">
                保存
              </button>
              <button onClick={newChart} className="btn btn-outline flex-1">
                新規
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              保存先はこのブラウザ内（アカウント同期は今後対応予定）
            </p>
          </section>

          <section className="card p-3">
            <h2 className="mb-2 text-sm font-semibold">保存済みチャート</h2>
            {saved.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">まだありません</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {saved.map((c) => (
                  <li key={c.id} className="flex items-center gap-1 text-sm">
                    <button
                      onClick={() => loadChart(c)}
                      className="min-h-11 flex-1 truncate rounded px-2 text-left hover:bg-zinc-100"
                      title={c.name}
                    >
                      {c.name}
                    </button>
                    <button
                      onClick={() => removeChart(c)}
                      className="min-h-11 rounded px-3 text-xs text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
