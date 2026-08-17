// 配合ルールエンジンの共通型定義。
// タイトル（DQM3 / 将来のDQM4・位階配合タイトル等）はこの型に沿った
// マスタデータ＋BreedingRuleset実装を1セット追加するだけで対応できる。

export interface RankDef {
  id: string; // 'G' | 'F' | ... | 'X'
  order: number; // 小さいほど下位ランク
}

export interface FamilyDef {
  id: string;
  name: string; // 例: スライム系
}

export interface Monster {
  id: string;
  name: string;
  familyId: string;
  rank: string;
  /** 野生で仲間にできる＝配合ツリーの葉になれる */
  obtainable?: boolean;
}

/** 通常配合テーブルの1エントリ: 系統ペア×ランク → 子候補 */
export interface NormalRule {
  familyA: string;
  familyB: string;
  rank: string;
  childIds: string[];
}

export type RecipeParent =
  | { kind: 'monster'; monsterId: string }
  | { kind: 'family'; familyId: string };

/** 特殊配合（固定レシピ）。DQM3では子は上位親と同ランクか1つ上 */
export interface SpecialRecipe {
  id: string;
  childId: string;
  parents: RecipeParent[];
}

export interface TitleData {
  id: string;
  name: string;
  ruleset: string; // 'dqm3' など。レジストリでエンジン実装を解決する
  note?: string;
  ranks: RankDef[];
  families: FamilyDef[];
  monsters: Monster[];
  normalRules: NormalRule[];
  specialRecipes: SpecialRecipe[];
}

/** 配合シミュレーション結果（親2体→子候補） */
export interface BreedingCandidate {
  child: Monster;
  method: 'normal' | 'special';
  recipe?: SpecialRecipe;
}

/** 逆算で得られる配合計画ツリー */
export type BreedingPlan =
  | { kind: 'wild'; monster: Monster; cost: number }
  | {
      kind: 'breed';
      monster: Monster;
      method: 'normal' | 'special';
      recipeId?: string;
      parents: BreedingPlan[];
      cost: number;
    };

export interface BreedingRuleset {
  /** 親2体から生まれうる子候補（通常配合＋特殊配合） */
  candidates(a: Monster, b: Monster, data: TitleData): BreedingCandidate[];
  /** 目標モンスターの入手手順を野生入手可能モンスターまで逆算する */
  plan(targetId: string, data: TitleData): BreedingPlan | null;
}
