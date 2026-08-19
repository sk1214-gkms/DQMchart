// 位階配合方式の配合ルールエンジン（イルルカSPなど）。
//
// 全モンスターには「位階」という通し順があり、子は位階の並びから決まる。
// - 同系統同士 → 強いほうの親より位階が1つ上の、同じ系統のモンスター
// - 異系統同士 → 次の3種類（＋親自身の種族）
//     1. 強いほうの親より位階が1つ上で、親Aと同じ系統
//     2. 強いほうの親より位階が1つ上で、親Bと同じ系統
//     3. 弱いほうの親より位階が1つ上で、系統組み合わせ表で決まる別系統
// 系統の最上位を超える子は生まれない（位階の打ち止め）。
import type {
  BreedingCandidate,
  BreedingPlan,
  BreedingRuleset,
  Monster,
  RecipeParent,
  SpecialRecipe,
  TitleData,
} from './types';

function monsterById(data: TitleData, id: string): Monster | undefined {
  return data.monsters.find((m) => m.id === id);
}

function tierOf(m: Monster): number {
  return m.tier ?? 0;
}

function parentMatches(p: RecipeParent, m: Monster): boolean {
  return p.kind === 'monster' ? p.monsterId === m.id : p.familyId === m.familyId;
}

function recipeMatches(recipe: SpecialRecipe, a: Monster, b: Monster): boolean {
  if (recipe.parents.length !== 2) return false;
  const [p1, p2] = recipe.parents;
  return (
    (parentMatches(p1, a) && parentMatches(p2, b)) ||
    (parentMatches(p1, b) && parentMatches(p2, a))
  );
}

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

/** 系統組み合わせ表を引く（順不同） */
function childFamilyOf(data: TitleData, famA: string, famB: string): string | null {
  for (const rule of data.familyPairs ?? []) {
    const hit =
      (rule.familyA === famA && rule.familyB === famB) ||
      (rule.familyA === famB && rule.familyB === famA);
    if (hit) return rule.childFamilyId;
  }
  return null;
}

/** 系統ごとに位階順（昇順）で並べたモンスター一覧。データごとに使い回す */
const familyOrderCache = new WeakMap<TitleData, Map<string, Monster[]>>();

function familyOrder(data: TitleData): Map<string, Monster[]> {
  let cached = familyOrderCache.get(data);
  if (!cached) {
    cached = new Map();
    for (const m of data.monsters) {
      const list = cached.get(m.familyId);
      if (list) list.push(m);
      else cached.set(m.familyId, [m]);
    }
    for (const list of cached.values()) list.sort((x, y) => tierOf(x) - tierOf(y));
    familyOrderCache.set(data, cached);
  }
  return cached;
}

/** その系統の中で、指定した位階より1つ上のモンスター（無ければnull＝打ち止め） */
function nextInFamily(data: TitleData, familyId: string, tier: number): Monster | null {
  const list = familyOrder(data).get(familyId);
  if (!list) return null;
  return list.find((m) => tierOf(m) > tier) ?? null;
}

/** その系統の中で、指定モンスターの1つ下のモンスター（無ければnull＝最下位） */
function prevInFamily(data: TitleData, target: Monster): Monster | null {
  const list = familyOrder(data).get(target.familyId);
  if (!list) return null;
  let prev: Monster | null = null;
  for (const m of list) {
    if (tierOf(m) >= tierOf(target)) break;
    prev = m;
  }
  return prev;
}

/** 位階配合で生まれる子（特殊配合は含まない） */
function tierCandidates(a: Monster, b: Monster, data: TitleData): Monster[] {
  const [strong, weak] = tierOf(a) >= tierOf(b) ? [a, b] : [b, a];
  const out: Monster[] = [];
  const add = (m: Monster | null) => {
    if (m && !out.some((x) => x.id === m.id)) out.push(m);
  };

  if (a.familyId === b.familyId) {
    add(nextInFamily(data, a.familyId, tierOf(strong)));
    return out;
  }

  add(nextInFamily(data, a.familyId, tierOf(strong)));
  add(nextInFamily(data, b.familyId, tierOf(strong)));
  const otherFamily = childFamilyOf(data, a.familyId, b.familyId);
  if (otherFamily) add(nextInFamily(data, otherFamily, tierOf(weak)));
  return out;
}

/**
 * 逆算プランナー。DQM3方式と同じく、入手できるモンスターを起点に
 * コストが下がらなくなるまで繰り返し緩和して最小手数を求める。
 */
class Planner {
  private best = new Map<string, BreedingPlan>();

  constructor(private data: TitleData) {
    this.computeAll();
  }

  plan(monsterId: string): BreedingPlan | null {
    return this.best.get(monsterId) ?? null;
  }

  planByBreeding(monsterId: string): BreedingPlan | null {
    const m = monsterById(this.data, monsterId);
    if (!m) return null;
    return this.tryBuild(m);
  }

  private computeAll(): void {
    for (const m of this.data.monsters) {
      if (m.obtainable) this.best.set(m.id, { kind: 'wild', monster: m, cost: 0 });
    }
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

  private tryBuild(m: Monster): BreedingPlan | null {
    let best: BreedingPlan | null = null;

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

    const byTier = this.tryBuildByTier(m);
    if (byTier && (!best || byTier.cost < best.cost)) best = byTier;

    return best;
  }

  /**
   * 位階配合で m を作る方法を探す。
   * mが生まれるのは「基準となる親の位階が、mの1つ下からmの手前までにある」とき。
   * その範囲に入る親を材料の安いものから選ぶ。
   */
  private tryBuildByTier(m: Monster): BreedingPlan | null {
    const prev = prevInFamily(this.data, m);
    const lower = prev ? tierOf(prev) : -1; // 基準の親はこの位階以上
    const upper = tierOf(m); // かつ m 未満

    const inRange = (x: Monster) => tierOf(x) >= lower && tierOf(x) < upper && x.id !== m.id;

    let best: BreedingPlan | null = null;
    const consider = (p1: BreedingPlan | null, p2: BreedingPlan | null) => {
      if (!p1 || !p2) return;
      const cost = 1 + p1.cost + p2.cost;
      if (!best || cost < best.cost) {
        best = { kind: 'breed', monster: m, method: 'normal', parents: [p1, p2], cost };
      }
    };

    // 候補1・2: 片親がmと同系統。強いほうの親の位階が範囲内で、もう片方はそれ以下
    const sameFamily = this.cheapestOf((x) => x.familyId === m.familyId && inRange(x));
    if (sameFamily) {
      const strongTier = tierOf(sameFamily.monster);
      // 相方は同系統でも別系統でもよいが、強いほうの親の位階を超えないこと
      const partner = this.cheapestOf((x) => tierOf(x) <= strongTier && x.id !== m.id);
      consider(sameFamily, partner);

      // 相方のほうが強い場合は、相方の位階も範囲内でなければならない
      const strongPartner = this.cheapestOf(
        (x) => inRange(x) && tierOf(x) >= tierOf(sameFamily.monster) && x.id !== m.id,
      );
      if (strongPartner) consider(sameFamily, strongPartner);
    }

    // 候補3: 系統組み合わせ表で m の系統になるペア。弱いほうの親の位階が範囲内
    for (const rule of this.data.familyPairs ?? []) {
      if (rule.childFamilyId !== m.familyId) continue;
      if (rule.familyA === rule.familyB) continue; // 同系統ペアは候補3を生まない
      const weak = this.cheapestOf((x) => x.familyId === rule.familyA && inRange(x));
      const strong = this.cheapestOf(
        (x) => x.familyId === rule.familyB && tierOf(x) >= lower && x.id !== m.id,
      );
      consider(weak, strong);

      const weakB = this.cheapestOf((x) => x.familyId === rule.familyB && inRange(x));
      const strongA = this.cheapestOf(
        (x) => x.familyId === rule.familyA && tierOf(x) >= lower && x.id !== m.id,
      );
      consider(weakB, strongA);
    }

    return best;
  }

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

const plannerCache = new WeakMap<TitleData, Planner>();

function getPlanner(data: TitleData): Planner {
  let planner = plannerCache.get(data);
  if (!planner) {
    planner = new Planner(data);
    plannerCache.set(data, planner);
  }
  return planner;
}

export const tierRuleset: BreedingRuleset = {
  candidates(a: Monster, b: Monster, data: TitleData): BreedingCandidate[] {
    const out: BreedingCandidate[] = [];
    for (const child of tierCandidates(a, b, data)) {
      out.push({ child, method: 'normal' });
    }
    // 親自身の種族も候補に残る
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

export const _internal = { tierCandidates, nextInFamily, prevInFamily, childFamilyOf };
