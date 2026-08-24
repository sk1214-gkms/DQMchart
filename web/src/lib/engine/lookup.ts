// モンスター1体について「どう作るか」「これで何が作れるか」を引く。
//
// 配合ツリー（逆算）とは目的が違う。ツリーは素材まで一気にさかのぼるが、
// ここでは1回の配合だけを見る。図鑑を引く感覚で使えるようにするため。
import type {
  BreedingRuleset,
  Monster,
  ParentPairGroup,
  SpecialRecipe,
  TitleData,
} from './types';

/** 特殊配合レシピと、その親を実際のモンスターに解決したもの */
export interface ResolvedRecipe {
  recipe: SpecialRecipe;
  /** 4体配合かどうか */
  quad: boolean;
  /** 親の表示用。系統指定はモンスターに解決せず条件のまま出す */
  parents: Array<
    | { kind: 'monster'; monster: Monster }
    | { kind: 'family'; text: string }
    | { kind: 'any'; text: string }
  >;
}

export interface HowToMake {
  /** 配合以外で手に入るか */
  monster: Monster;
  /** 特殊配合・4体配合のレシピ（データにあるものは全部） */
  special: ResolvedRecipe[];
  /** 位階配合など、計算で決まる親の組み合わせ */
  pairs: ParentPairGroup[];
  /** 方式が親の組み合わせの列挙に対応していない（＝pairsが網羅的でない） */
  pairsUnsupported: boolean;
}

/** 親の指定を表示用に直す */
function resolveParents(data: TitleData, recipe: SpecialRecipe): ResolvedRecipe['parents'] {
  const familyName = (id: string) => data.families.find((f) => f.id === id)?.name ?? id;
  return recipe.parents.map((p) => {
    if (p.kind === 'monster') {
      const monster = data.monsters.find((m) => m.id === p.monsterId);
      return monster
        ? ({ kind: 'monster', monster } as const)
        : ({ kind: 'family', text: p.monsterId } as const);
    }
    if (p.kind === 'family') {
      const base = familyName(p.familyId);
      const min = p.minRankId ? `${p.minRankId}ランク以上の` : '';
      const max = p.maxRankId ? `${p.maxRankId}ランク以下の` : '';
      return { kind: 'family', text: `${min}${max}${base}のモンスター` } as const;
    }
    return { kind: 'any', text: 'どのモンスターでも' } as const;
  });
}

/** そのモンスターの作り方（1回の配合ぶん） */
export function howToMake(
  engine: BreedingRuleset,
  data: TitleData,
  monsterId: string,
): HowToMake | null {
  const monster = data.monsters.find((m) => m.id === monsterId);
  if (!monster) return null;

  const special = data.specialRecipes
    .filter((r) => r.childId === monsterId)
    .map((recipe) => ({
      recipe,
      quad: recipe.parents.length === 4,
      parents: resolveParents(data, recipe),
    }));

  const pairs = engine.parentPairs ? engine.parentPairs(monsterId, data) : [];
  return { monster, special, pairs, pairsUnsupported: engine.parentPairs === undefined };
}

/** 「このモンスターを親にすると何が生まれるか」の1件 */
export interface Usage {
  child: Monster;
  /** 相方。系統指定などの場合は文言 */
  partners: Monster[];
  partnerText?: string;
  method: 'normal' | 'special' | 'quad';
}

/**
 * そのモンスターを親に使って作れるもの。
 *
 * 特殊配合・4体配合だけを見る。位階配合まで含めると、
 * 強いモンスターと弱いモンスターを別系統で組んだときに生まれる弱い子まで入り、
 * 200件を超えて役に立たなくなるため。
 */
export function usedFor(
  engine: BreedingRuleset,
  data: TitleData,
  monsterId: string,
): Usage[] {
  const monster = data.monsters.find((m) => m.id === monsterId);
  if (!monster) return [];
  const byId = new Map(data.monsters.map((m) => [m.id, m]));
  const familyName = (id: string) => data.families.find((f) => f.id === id)?.name ?? id;
  const out: Usage[] = [];

  // 特殊配合・4体配合: そのモンスターを親に含むレシピ
  for (const r of data.specialRecipes) {
    const hit = r.parents.some((p) => p.kind === 'monster' && p.monsterId === monsterId);
    if (!hit) continue;
    const child = byId.get(r.childId);
    if (!child) continue;
    // 自分以外の親を相方として出す（同じモンスターを複数使うレシピもある）
    let used = false;
    const others: Monster[] = [];
    const texts: string[] = [];
    for (const p of r.parents) {
      if (p.kind === 'monster' && p.monsterId === monsterId && !used) {
        used = true;
        continue;
      }
      if (p.kind === 'monster') {
        const m = byId.get(p.monsterId);
        if (m) others.push(m);
      } else if (p.kind === 'family') {
        texts.push(`${familyName(p.familyId)}のモンスター`);
      } else {
        texts.push('どのモンスターでも');
      }
    }
    out.push({
      child,
      partners: others,
      partnerText: texts.length ? texts.join('・') : undefined,
      method: r.parents.length === 4 ? 'quad' : 'special',
    });
  }

  return out;
}
