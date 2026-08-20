// レシピの「親の条件」を判定する共通処理。
// 方式（DQM3・位階配合・ジョーカー3）が違っても、親の指定の読み方は同じなのでここにまとめる。
import type { Monster, RecipeParent, SpecialRecipe, TitleData } from './types';

/** ランクの強さ順。データごとに使い回す */
const rankOrderCache = new WeakMap<TitleData, Map<string, number>>();

function rankOrder(data: TitleData): Map<string, number> {
  let cached = rankOrderCache.get(data);
  if (!cached) {
    cached = new Map(data.ranks.map((r) => [r.id, r.order]));
    rankOrderCache.set(data, cached);
  }
  return cached;
}

/** そのモンスターが親の条件を満たすか */
export function parentMatches(data: TitleData, p: RecipeParent, m: Monster): boolean {
  if (p.kind === 'any') return true;
  if (p.kind === 'monster') return p.monsterId === m.id;
  if (p.familyId !== m.familyId) return false;
  if (p.minRankId === undefined) return true;
  // 「自然系のSランク以上」のような下限付きの指定
  const order = rankOrder(data);
  const need = order.get(p.minRankId);
  const has = order.get(m.rank);
  return need !== undefined && has !== undefined && has >= need;
}

/** 2体用レシピが親(a,b)に一致するか（順不同。4体配合はquadCandidatesで扱う） */
export function recipeMatches(
  data: TitleData,
  recipe: SpecialRecipe,
  a: Monster,
  b: Monster,
): boolean {
  if (recipe.parents.length !== 2) return false;
  const [p1, p2] = recipe.parents;
  return (
    (parentMatches(data, p1, a) && parentMatches(data, p2, b)) ||
    (parentMatches(data, p1, b) && parentMatches(data, p2, a))
  );
}

/**
 * 親の条件の並びと、実際のモンスターの並びが順不同で対応づくか。
 * 4体配合のように「どれがどの条件に当たるか」が決まっていない場合に使う。
 */
export function matchesUnordered(
  data: TitleData,
  reqs: RecipeParent[],
  monsters: Monster[],
): boolean {
  if (reqs.length !== monsters.length) return false;
  const used = new Array(monsters.length).fill(false);
  const assign = (i: number): boolean => {
    if (i === reqs.length) return true;
    for (let j = 0; j < monsters.length; j++) {
      if (used[j] || !parentMatches(data, reqs[i], monsters[j])) continue;
      used[j] = true;
      if (assign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return assign(0);
}
