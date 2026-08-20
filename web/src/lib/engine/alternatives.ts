// 「この配合、相方は他のモンスターでもいいのでは？」に答えるための補助。
//
// 位階配合は「同じ系統で位階が条件を満たしていれば相方は何でもよい」ため、
// 手順に具体的な1体だけを書くと、その1体を用意しないと作れないように見えてしまう。
// ここでは実際の配合判定を使って代替候補を洗い出し、条件文にまとめる。
import type { BreedingRuleset, Monster, TitleData } from './types';

export interface ParentAlternatives {
  /** 実際に使える相方の一覧（入手できるものだけ、入手しやすい順） */
  candidates: Monster[];
  /** 「スライム系の位階30以下」のような条件文。まとめられない場合は null */
  summary: string | null;
}

/**
 * 親の片方を固定したとき、同じ子が生まれるもう片方の候補を集める。
 * 到達できないモンスターは相方に使えないので除く。
 */
export function findParentAlternatives(
  engine: BreedingRuleset,
  data: TitleData,
  childId: string,
  fixedParentId: string,
): ParentAlternatives {
  const fixed = data.monsters.find((m) => m.id === fixedParentId);
  if (!fixed) return { candidates: [], summary: null };

  const candidates = data.monsters.filter((x) => {
    if (x.id === childId) return false;
    if (engine.plan(x.id, data) === null) return false; // 用意できないものは除く
    return engine.candidates(fixed, x, data).some((c) => c.child.id === childId);
  });

  return { candidates, summary: summarize(engine, data, candidates) };
}

/**
 * 候補の共通点を「○○系の位階△△以下」のような条件文にする。
 *
 * 位階配合では、上限側が効く場合（相方が弱いほど狙った子になる）と
 * 下限側が効く場合（弱いほうの親が基準になるので相方は強ければ何でもよい）の
 * 両方があるため、「以下」「以上」を取り違えないように用意できる全体と見比べて決める。
 */
function summarize(
  engine: BreedingRuleset,
  data: TitleData,
  candidates: Monster[],
): string | null {
  if (candidates.length < 2) return null;

  const familyIds = new Set(candidates.map((m) => m.familyId));
  // 系統がいくつかにまたがることもあるので、まとめて「○○系・△△系の」と書けるようにする。
  // 系統が多すぎると読みにくいだけなので、その場合は系統の限定をあきらめる。
  const names = [...familyIds].map(
    (id) => data.families.find((f) => f.id === id)?.name ?? id,
  );
  const allFamilies = familyIds.size === data.families.length;
  const familyLabel = !allFamilies && familyIds.size <= 3 ? names.join('・') : null;
  const whole = familyLabel ? `${familyLabel}のモンスター` : 'どのモンスターでも';
  /** 「スライム系の位階30以下」「位階30以下のモンスター」のように系統の有無で語順を変える */
  const withTier = (cond: string) =>
    familyLabel ? `${familyLabel}の位階${cond}` : `位階${cond}のモンスター`;

  const tiers = candidates.map((m) => m.tier).filter((t): t is number => t !== undefined);
  if (tiers.length !== candidates.length || tiers.length === 0) {
    return familyLabel ? whole : null;
  }
  const min = Math.min(...tiers);
  const max = Math.max(...tiers);

  // 「用意できるモンスター」のうち、この条件で絞られるのはどこかを見る
  const pool = data.monsters.filter(
    (m) =>
      m.tier !== undefined &&
      (familyLabel === null || familyIds.has(m.familyId)) &&
      engine.plan(m.id, data) !== null,
  );
  const ids = new Set(candidates.map((m) => m.id));
  const covers = (test: (t: number) => boolean) =>
    pool.every((m) => test(m.tier as number) === ids.has(m.id));

  if (covers(() => true)) return whole;
  if (covers((t) => t <= max)) return withTier(`${max}以下`);
  if (covers((t) => t >= min)) return withTier(`${min}以上`);
  if (covers((t) => t >= min && t <= max)) return withTier(`${min}〜${max}`);
  return familyLabel ? whole : null;
}
