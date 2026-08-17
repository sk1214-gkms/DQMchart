// チャート保存のストレージ抽象。
// MVPではlocalStorage実装のみ。Supabase導入時はChartStore実装を差し替える。
import { getKey, setKey, subscribeKey } from './localStore';

export interface SavedChartNode {
  id: string;
  monsterId: string;
  x: number;
  y: number;
}

export interface SavedChartEdge {
  id: string;
  source: string; // 親ノードid
  target: string; // 子ノードid
}

export interface SavedChart {
  id: string;
  titleId: string;
  name: string;
  nodes: SavedChartNode[];
  edges: SavedChartEdge[];
  updatedAt: string; // ISO文字列
}

export interface ChartStore {
  list(titleId: string): SavedChart[];
  save(chart: SavedChart): void;
  remove(id: string): void;
}

const KEY = 'haigou-charts-v1';
const EMPTY = '[]';

function readAll(): SavedChart[] {
  try {
    return JSON.parse(getKey(KEY) ?? EMPTY) as SavedChart[];
  } catch {
    return [];
  }
}

export const localChartStore: ChartStore = {
  list(titleId) {
    return readAll()
      .filter((c) => c.titleId === titleId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  save(chart) {
    const all = readAll().filter((c) => c.id !== chart.id);
    all.push(chart);
    setKey(KEY, JSON.stringify(all));
  },
  remove(id) {
    setKey(KEY, JSON.stringify(readAll().filter((c) => c.id !== id)));
  },
};

// useSyncExternalStore用（スナップショットは生JSON文字列＝参照安定）
export function subscribeCharts(cb: () => void): () => void {
  return subscribeKey(KEY, cb);
}

export function getChartsSnapshot(): string {
  return getKey(KEY) ?? EMPTY;
}

export function getChartsServerSnapshot(): string {
  return EMPTY;
}

export function parseCharts(snapshot: string, titleId: string): SavedChart[] {
  try {
    return (JSON.parse(snapshot) as SavedChart[])
      .filter((c) => c.titleId === titleId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}
