// DQM3方式の配合ルールエンジン。
// - 通常配合: 親2体の「系統ペア×ランク」で子候補が決まる。
//   親のランクが異なる場合は両方のランクのテーブルから選べる。
//   仕様上、通常配合では親よりランクが上の子は生まれない（テーブルが親ランクにしか無いため）。
// - 特殊配合: 固定レシピ（モンスター指定 or 系統指定）。ランクアップは特殊配合のみ。
import type {
  BreedingCandidate,
  BreedingPlan,
  BreedingRuleset,
  Monster,
  RecipeParent,
  SpecialRecipe,
  TitleData,
} from './types';

function pairKey(famX: string, famY: string): string {
  return [famX, famY].sort().join('|');
}

function monsterById(data: TitleData, id: string): Monster | undefined {
  return data.monsters.find((m) => m.id === id);
}

function rankOrder(data: TitleData, rankId: string): number {
  return data.ranks.find((r) => r.id === rankId)?.order ?? Number.MAX_SAFE_INTEGER;
}

function parentMatches(p: RecipeParent, m: Monster): boolean {
  return p.kind === 'monster' ? p.monsterId === m.id : p.familyId === m.familyId;
}

/** 2体用レシピが親(a,b)に一致するか（順不同） */
function recipeMatches(recipe: SpecialRecipe, a: Monster, b: Monster): boolean {
  if (recipe.parents.length !== 2) return false; // 4体配合はquadCandidatesで扱う
  const [p1, p2] = recipe.parents;
  return (
    (parentMatches(p1, a) && parentMatches(p2, b)) ||
    (parentMatches(p1, b) && parentMatches(p2, a))
  );
}

/**
 * レシピの親条件リストとモンスターの集合が過不足なく対応づくか（順不同）。
 * 同じモンスターを2体要求するレシピがあるため、使用済みを消し込みながら照合する。
 */
function matchesUnordered(reqs: RecipeParent[], monsters: Monster[]): boolean {
  if (reqs.length !== monsters.length) return false;
  const used = new Array(monsters.length).fill(false);
  const assign = (i: number): boolean => {
    if (i === reqs.length) return true;
    for (let j = 0; j < monsters.length; j++) {
      if (used[j] || !parentMatches(reqs[i], monsters[j])) continue;
      used[j] = true;
      if (assign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return assign(0);
}

function normalCandidates(a: Monster, b: Monster, data: TitleData): Monster[] {
  const key = pairKey(a.familyId, b.familyId);
  const ranks = Array.from(new Set([a.rank, b.rank]));
  const out: Monster[] = [];
  for (const rule of data.normalRules) {
    if (pairKey(rule.familyA, rule.familyB) !== key) continue;
    if (!ranks.includes(rule.rank)) continue;
    for (const id of rule.childIds) {
      const m = monsterById(data, id);
      if (m && !out.some((x) => x.id === m.id)) out.push(m);
    }
  }
  return out;
}

/**
 * 逆算プランナー。全モンスターの最小手数（配合回数）プランを一括で求める。
 *
 * 配合の依存関係は循環しうる（Aの材料にBが要り、Bの材料にもAが要る等）ため、
 * 素朴な深さ優先探索だと循環に入った枝を打ち切って到達可能な経路を取りこぼす。
 * そこで入手可能モンスター（コスト0）を起点に、コストが下がらなくなるまで
 * 全レシピを繰り返し緩和する方式（最短経路の緩和法と同じ考え方）で解いている。
 */
class Planner {
  private best = new Map<string, BreedingPlan>();

  constructor(private data: TitleData) {
    this.computeAll();
  }

  plan(monsterId: string): BreedingPlan | null {
    return this.best.get(monsterId) ?? null;
  }

  /** 直接入手を使わず、必ず配合で作る場合のプラン（材料側は最短ルートを使う） */
  planByBreeding(monsterId: string): BreedingPlan | null {
    const m = monsterById(this.data, monsterId);
    if (!m) return null;
    return this.tryBuild(m);
  }

  private computeAll(): void {
    for (const m of this.data.monsters) {
      if (m.obtainable) this.best.set(m.id, { kind: 'wild', monster: m, cost: 0 });
    }
    // 1周で最低1体は確定するため、反復回数はモンスター数で頭打ちになる
    for (let i = 0; i < this.data.monsters.length; i++) {
      let improved = false;
      for (const m of this.data.monsters) {
        const candidate = this.tryBuild(m);
        if (!candidate) continue;
        const current = this.best.get(m.id);
        if (!current || candidate.cost < current.cost) {
          this.best.set(m.id, candidate);
          improved = true;
        }
      }
      if (!improved) break;
    }
  }

  /** 現時点で確定しているプランだけを材料に、mを作る最小コストの配合を探す */
  private tryBuild(m: Monster): BreedingPlan | null {
    let best: BreedingPlan | null = null;

    // 特殊配合レシピ（2体配合＝1回、4体配合＝中間2回＋最終1回で3回）
    for (const recipe of this.data.specialRecipes) {
      if (recipe.childId !== m.id) continue;
      if (recipe.parents.length !== 2 && recipe.parents.length !== 4) continue;
      const parentPlans = recipe.parents.map((p) => this.planForRequirement(p, m.id));
      if (parentPlans.some((p) => p === null)) continue;
      const plans = parentPlans as BreedingPlan[];
      const quad = recipe.parents.length === 4;
      const cost = (quad ? 3 : 1) + plans.reduce((s, p) => s + p.cost, 0);
      if (!best || cost < best.cost) {
        best = {
          kind: 'breed',
          monster: m,
          method: quad ? 'quad' : 'special',
          recipeId: recipe.id,
          parents: plans,
          cost,
        };
      }
    }

    // 通常配合テーブル:
    // 子が載っているエントリ(famA×famB, rank r)について、
    // 片親=famA・ランクr、もう片親=famB・ランクr以下（入替も試す）で最小コストの親を選ぶ。
    for (const rule of this.data.normalRules) {
      if (!rule.childIds.includes(m.id)) continue;
      const assignments: Array<[string, string]> = [
        [rule.familyA, rule.familyB],
        [rule.familyB, rule.familyA],
      ];
      for (const [anchorFam, otherFam] of assignments) {
        const anchor = this.cheapestOf(
          (x) => x.familyId === anchorFam && x.rank === rule.rank && x.id !== m.id,
        );
        const other = this.cheapestOf(
          (x) =>
            x.familyId === otherFam &&
            rankOrder(this.data, x.rank) <= rankOrder(this.data, rule.rank) &&
            x.id !== m.id,
        );
        if (!anchor || !other) continue;
        const cost = 1 + anchor.cost + other.cost;
        if (!best || cost < best.cost) {
          best = { kind: 'breed', monster: m, method: 'normal', parents: [anchor, other], cost };
        }
      }
    }

    return best;
  }

  /** レシピの親条件（モンスター指定/系統指定）を満たす最小コストのプラン */
  private planForRequirement(p: RecipeParent, childId: string): BreedingPlan | null {
    if (p.kind === 'monster') {
      return p.monsterId === childId ? null : this.plan(p.monsterId);
    }
    return this.cheapestOf((x) => x.familyId === p.familyId && x.id !== childId);
  }

  private cheapestOf(pred: (m: Monster) => boolean): BreedingPlan | null {
    let best: BreedingPlan | null = null;
    for (const m of this.data.monsters) {
      if (!pred(m)) continue;
      const p = this.best.get(m.id);
      if (p && (best === null || p.cost < best.cost)) best = p;
    }
    return best;
  }
}

// 同じマスタデータへの繰り返し呼び出しでは計算結果を使い回す
const plannerCache = new WeakMap<TitleData, Planner>();

function getPlanner(data: TitleData): Planner {
  let planner = plannerCache.get(data);
  if (!planner) {
    planner = new Planner(data);
    plannerCache.set(data, planner);
  }
  return planner;
}

export const dqm3Ruleset: BreedingRuleset = {
  candidates(a: Monster, b: Monster, data: TitleData): BreedingCandidate[] {
    const out: BreedingCandidate[] = [];
    for (const child of normalCandidates(a, b, data)) {
      out.push({ child, method: 'normal' });
    }
    // 親自身の種族も常に子候補に含まれる（同系統配合では親のどちらかしか生まれない）
    for (const parent of [a, b]) {
      if (!out.some((c) => c.child.id === parent.id)) {
        out.push({ child: parent, method: 'normal' });
      }
    }
    for (const recipe of data.specialRecipes) {
      if (!recipeMatches(recipe, a, b)) continue;
      const child = monsterById(data, recipe.childId);
      if (child) out.push({ child, method: 'special', recipe });
    }
    return out;
  },

  quadCandidates(grandparents: Monster[], data: TitleData): BreedingCandidate[] {
    if (grandparents.length !== 4) return [];
    const out: BreedingCandidate[] = [];
    for (const recipe of data.specialRecipes) {
      if (recipe.parents.length !== 4) continue;
      if (!matchesUnordered(recipe.parents, grandparents)) continue;
      const child = monsterById(data, recipe.childId);
      if (child) out.push({ child, method: 'quad', recipe });
    }
    return out;
  },

  plan(targetId: string, data: TitleData): BreedingPlan | null {
    return getPlanner(data).plan(targetId);
  },

  planByBreeding(targetId: string, data: TitleData): BreedingPlan | null {
    return getPlanner(data).planByBreeding(targetId);
  },
};

export const _internal = { normalCandidates, recipeMatches, pairKey };
