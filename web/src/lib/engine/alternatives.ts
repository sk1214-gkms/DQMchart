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

  return { candidates, summary: summarize(data, candidates) };
}

/** 候補の共通点を「○○系の位階△△以下」のような条件文にする */
function summarize(data: TitleData, candidates: Monster[]): string | null {
  if (candidates.length < 2) return null;

  const familyIds = new Set(candidates.map((m) => m.familyId));
  const familyName =
    familyIds.size === 1
      ? (data.families.find((f) => f.id === [...familyIds][0])?.name ?? null)
      : null;

  const tiers = candidates.map((m) => m.tier).filter((t): t is number => t !== undefined);
  const hasTier = tiers.length === candidates.length && tiers.length > 0;

  if (familyName && hasTier) {
    return `${familyName}の位階${Math.max(...tiers)}以下`;
  }
  if (familyName) return `${familyName}のモンスター`;
  if (hasTier) return `位階${Math.max(...tiers)}以下のモンスター`;
  return null;
}
