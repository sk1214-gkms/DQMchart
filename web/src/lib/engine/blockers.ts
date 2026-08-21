// 「このモンスターはなぜ作れないのか」を説明するための逆算。
//
// 到達できない理由はだいたい次の3つ。
//   1. 配信が終了していて、そのモンスター自体が今は手に入らない
//   2. 配合レシピはあるが、材料のどれかが手に入らない（さかのぼると1に行き着く）
//   3. レシピも入手方法も登録されていない（データの不足）
// 1と2は調べても解決しないので、それが分かるように区別して伝える。
import type { BreedingRuleset, Monster, TitleData } from './types';

export interface BlockReason {
  kind: 'discontinued' | 'materials' | 'unknown';
  /** 大元で行き止まりになっているモンスター（配信終了など） */
  roots: Monster[];
}

export function explainUnreachable(
  engine: BreedingRuleset,
  data: TitleData,
  targetId: string,
): BlockReason {
  const byId = new Map(data.monsters.map((m) => [m.id, m]));
  const target = byId.get(targetId);
  if (target?.discontinued) return { kind: 'discontinued', roots: [target] };

  const unreachable = (id: string) => engine.plan(id, data) === null;
  const roots = new Map<string, Monster>();
  const seen = new Set<string>();
  let sawRecipe = false;

  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const recipes = data.specialRecipes.filter((r) => r.childId === id);
    const blockers: string[] = [];
    for (const r of recipes) {
      for (const p of r.parents) {
        if (p.kind === 'monster' && unreachable(p.monsterId)) blockers.push(p.monsterId);
      }
    }
    if (recipes.length > 0) sawRecipe = true;
    if (blockers.length === 0) {
      // これ以上さかのぼれない＝ここが原因
      const m = byId.get(id);
      if (m && (id !== targetId || recipes.length === 0)) roots.set(id, m);
      return;
    }
    blockers.forEach(walk);
  };
  walk(targetId);

  const list = [...roots.values()];
  if (list.some((m) => m.discontinued)) {
    return { kind: 'discontinued', roots: list.filter((m) => m.discontinued) };
  }
  return { kind: sawRecipe ? 'materials' : 'unknown', roots: list };
}
