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

/** 配合以外の入手手段。egg=タマゴ限定、event=イベント・コラボ配信など */
export type AcquisitionKind = 'wild' | 'egg' | 'event';

export interface Monster {
  id: string;
  name: string;
  familyId: string;
  rank: string;
  /** 配合以外で入手できる＝配合ツリーの葉になれる */
  obtainable?: boolean;
  /** 入手手段の種類（obtainableがtrueのとき） */
  acquisition?: AcquisitionKind;
  /** 入手方法の詳細（タマゴの色・出現場所・イベント条件など） */
  acquisitionDetail?: string;
  /**
   * 位階（大きいほど上位）。位階配合方式のタイトルで使う。
   * 「位階が1つ上」は同じ系統の中で次に位階が大きいモンスターを指す。
   */
  tier?: number;
  /**
   * 位階配合では生まれないモンスター（特殊配合などでのみ入手できる）。
   * 位階配合の子を選ぶときは読み飛ばし、さらに1つ上の同系統モンスターが選ばれる。
   */
  tierExcluded?: boolean;
}

/** 通常配合テーブルの1エントリ: 系統ペア×ランク → 子候補 */
export interface NormalRule {
  familyA: string;
  familyB: string;
  rank: string;
  childIds: string[];
}

/** 位階配合で親2体の系統から「別系統の子」の系統を決める表 */
export interface FamilyPairRule {
  familyA: string;
  familyB: string;
  childFamilyId: string;
}

export type RecipeParent =
  | { kind: 'monster'; monsterId: string }
  | { kind: 'family'; familyId: string };

/** 特殊配合（固定レシピ）。DQM3では子は上位親と同ランクか1つ上 */
export interface SpecialRecipe {
  id: string;
  childId: string;
  parents: RecipeParent[];
  /** 備考（4体配合・DLC限定など）。parentsが4件のレシピは4体配合で、現状エンジンは未対応 */
  note?: string;
}

export interface TitleData {
  id: string;
  name: string;
  ruleset: string; // 'dqm3' など。レジストリでエンジン実装を解決する
  ranks: RankDef[];
  families: FamilyDef[];
  monsters: Monster[];
  /** DQM3方式の通常配合表（位階配合方式のタイトルでは持たない） */
  normalRules?: NormalRule[];
  /** 位階配合方式の系統組み合わせ表（DQM3方式のタイトルでは持たない） */
  familyPairs?: FamilyPairRule[];
  specialRecipes: SpecialRecipe[];
}

/** 配合方法。quad=4体配合（祖父母4体の組み合わせで決まる） */
export type BreedingMethod = 'normal' | 'special' | 'quad';

/** 配合シミュレーション結果（親2体→子候補） */
export interface BreedingCandidate {
  child: Monster;
  method: BreedingMethod;
  recipe?: SpecialRecipe;
}

/** 逆算で得られる配合計画ツリー。quadのparentsは祖父母4体 */
export type BreedingPlan =
  | { kind: 'wild'; monster: Monster; cost: number }
  | {
      kind: 'breed';
      monster: Monster;
      method: BreedingMethod;
      recipeId?: string;
      parents: BreedingPlan[];
      cost: number;
    };

export interface BreedingRuleset {
  /** 親2体から生まれうる子候補（通常配合＋特殊配合） */
  candidates(a: Monster, b: Monster, data: TitleData): BreedingCandidate[];
  /**
   * 4体配合の判定。祖父母4体の組み合わせで決まるため親2体だけでは判定できない。
   * 親2体それぞれの親（＝祖父母4体）が判明しているときに使う。
   */
  quadCandidates(grandparents: Monster[], data: TitleData): BreedingCandidate[];
  /** 目標モンスターの入手手順を、配合なしで入手できるモンスターまで逆算する */
  plan(targetId: string, data: TitleData): BreedingPlan | null;
  /**
   * 目標自身は必ず配合で作る場合のプラン。
   * 野生などで直接入手できるモンスターでも配合ルートを見たいときに使う。
   * 配合で作る方法がなければ null。
   */
  planByBreeding(targetId: string, data: TitleData): BreedingPlan | null;
}
