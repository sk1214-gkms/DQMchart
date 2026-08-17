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
  const [chartId, setChartId] = useState<string | null>(null);
  const [chartName, setChartName] = useState('');

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
          <div className="h-[55vh] min-h-[300px] rounded-lg border border-zinc-200 bg-white shadow-sm lg:h-[600px]">
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={deleteSelected}
              disabled={selectedCount === 0}
              className="btn btn-outline text-sm text-red-600"
            >
              選択中を削除{selectedCount > 0 && `（${selectedCount}）`}
            </button>
            <span className="text-xs text-zinc-500">
              ノードや線をタップして選択 → 削除（パソコンではDeleteキーでも可）
            </span>
          </div>

          <p className="text-xs text-zinc-500">
            モンスターの下側の丸から、子にしたいモンスターの上側の丸へドラッグすると配合線がつながります（親2体→子）。
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
            <li>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />
              配合成立
            </li>
            <li>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />
              配合不成立
            </li>
            <li>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
              親が2体でない
            </li>
            <li>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />
              配合なしで入手可
            </li>
          </ul>
        </div>

        <aside className="order-2 flex w-full flex-col gap-4 lg:order-1 lg:w-72">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <MonsterPicker data={data} value={pickId} onChange={setPickId} label="モンスターを追加" />
            <button onClick={addMonster} disabled={!pickId} className="btn btn-primary mt-2 w-full">
              キャンバスに追加
            </button>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
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
            <p className="mt-2 text-[11px] text-zinc-500">
              保存先はこのブラウザ内（アカウント同期は今後対応予定）
            </p>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">保存済みチャート</h2>
            {saved.length === 0 ? (
              <p className="text-xs text-zinc-500">まだありません</p>
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
