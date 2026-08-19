// ジョーカー3方式の配合ルールエンジン。
//
// 同じ「位階」を使うがイルルカ／テリワンとは決め方が違い、
// 親2体の位階から3通りの計算で子の位階番号を出す（系統は関与しない）。
// 位階が高いほうを親A、低いほうを親Bとして、
//   1の位の合計が10以上のとき      10未満のとき
//   候補1: A + (Bの1の位)          A + (Bの1の位) + 10
//   候補2: B + (Aの1の位) - 5      B + (Aの1の位) + 5
//   候補3: (A + B) ÷ 2（切り捨て）
// これに親A・親B自身を加えた5種類から選ぶ。
// 計算結果が一般配合で作れないモンスターだった場合は1つ下の位階になる。
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
  if (p.kind === 'any') return true;
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

/** 位階番号からモンスターを引く索引。データごとに使い回す */
const tierIndexCache = new WeakMap<TitleData, Map<number, Monster>>();

function tierIndex(data: TitleData): Map<number, Monster> {
  let cached = tierIndexCache.get(data);
  if (!cached) {
    cached = new Map();
    for (const m of data.monsters) cached.set(tierOf(m), m);
    tierIndexCache.set(data, cached);
  }
  return cached;
}

/**
 * 計算で出た位階番号に対応するモンスター。
 * その位階が一般配合で作れないモンスターなら、1つずつ下げて作れるものを探す。
 */
function monsterAtTier(data: TitleData, tier: number): Monster | null {
  const index = tierIndex(data);
  for (let t = tier; t >= 1; t--) {
    const m = index.get(t);
    if (m && !m.tierExcluded) return m;
  }
  return null;
}

/** 親2体の位階から、子になりうる位階番号を3つ求める */
export function childTiers(tierA: number, tierB: number): number[] {
  const [high, low] = tierA >= tierB ? [tierA, tierB] : [tierB, tierA];
  const carry = (high % 10) + (low % 10) >= 10;
  return [
    carry ? high + (low % 10) : high + (low % 10) + 10,
    carry ? low + (high % 10) - 5 : low + (high % 10) + 5,
    Math.floor((high + low) / 2),
  ];
}

/** 位階配合で生まれる子（特殊配合は含まない） */
function tierCandidates(a: Monster, b: Monster, data: TitleData): Monster[] {
  const out: Monster[] = [];
  for (const tier of childTiers(tierOf(a), tierOf(b))) {
    const m = monsterAtTier(data, tier);
    if (m && !out.some((x) => x.id === m.id)) out.push(m);
  }
  return out;
}

/**
 * 逆算プランナー。他方式と同じく、入手できるモンスターを起点に
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
   * 位階配合で m を作る親の組み合わせを探す。
   * 総当たりだと重いので、計算式を逆に解いて候補の親だけを試す。
   */
  private tryBuildByTier(m: Monster): BreedingPlan | null {
    if (m.tierExcluded) return null; // 一般配合では生まれない
    const target = tierOf(m);
    // 作れない位階を飛ばして m にたどり着く場合があるので、狙う位階には幅がある
    const targets = this.tiersLandingOn(m);
    if (targets.length === 0) return null;

    let best: BreedingPlan | null = null;
    const consider = (pa: Monster, pb: Monster) => {
      if (pa.id === m.id || pb.id === m.id) return;
      // 実際にその組み合わせで m が生まれるか検算してから採用する
      if (!tierCandidates(pa, pb, this.data).some((c) => c.id === m.id)) return;
      const p1 = this.best.get(pa.id);
      const p2 = this.best.get(pb.id);
      if (!p1 || !p2) return;
      const cost = 1 + p1.cost + p2.cost;
      if (!best || cost < best.cost) {
        best = { kind: 'breed', monster: m, method: 'normal', parents: [p1, p2], cost };
      }
    };

    const index = tierIndex(this.data);
    for (const goal of targets) {
      // 候補3（平均）から: high + low が goal*2 か goal*2+1
      for (const sum of [goal * 2, goal * 2 + 1]) {
        for (let high = Math.ceil(sum / 2); high <= Math.min(sum - 1, target * 2); high++) {
          const low = sum - high;
          if (low < 1 || low > high) continue;
          const pa = index.get(high);
          const pb = index.get(low);
          if (pa && pb) consider(pa, pb);
        }
      }
      // 候補1: high + (low の1の位) = goal → high は goal-9 〜 goal
      for (let high = Math.max(1, goal - 19); high <= goal; high++) {
        const pa = index.get(high);
        if (!pa) continue;
        for (const [lowTier, pb] of index) {
          if (lowTier > high) continue;
          consider(pa, pb);
        }
      }
    }
    return best;
  }

  /** m にたどり着く位階番号（m自身と、m の上にある作れないモンスターの位階） */
  private tiersLandingOn(m: Monster): number[] {
    const index = tierIndex(this.data);
    const out = [tierOf(m)];
    for (let t = tierOf(m) + 1; ; t++) {
      const above = index.get(t);
      if (!above || !above.tierExcluded) break;
      out.push(t);
    }
    return out;
  }

  private planForRequirement(p: RecipeParent, childId: string): BreedingPlan | null {
    if (p.kind === 'monster') {
      return p.monsterId === childId ? null : this.plan(p.monsterId);
    }
    if (p.kind === 'any') return this.cheapestOf((x) => x.id !== childId);
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

export const dqmj3Ruleset: BreedingRuleset = {
  candidates(a: Monster, b: Monster, data: TitleData): BreedingCandidate[] {
    const out: BreedingCandidate[] = [];
    for (const child of tierCandidates(a, b, data)) {
      out.push({ child, method: 'normal' });
    }
    // 4番目・5番目の選択肢は親自身
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

export const _internal = { childTiers, monsterAtTier, tierCandidates };
