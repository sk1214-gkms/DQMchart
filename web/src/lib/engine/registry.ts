// タイトルごとの配合ルールエンジンを解決するレジストリ。
// 新タイトル対応時はここに実装を1行追加する（DQM4はDQM3方式を想定）。
import type { BreedingRuleset } from './types';
import { dqm3Ruleset } from './dqm3';
import { tierRuleset } from './tier';

const rulesets: Record<string, BreedingRuleset> = {
  dqm3: dqm3Ruleset,
  tier: tierRuleset, // 位階配合方式（イルルカSPなど）
};

export function getRuleset(rulesetId: string): BreedingRuleset {
  const rs = rulesets[rulesetId];
  if (!rs) throw new Error(`未対応の配合ルールセットです: ${rulesetId}`);
  return rs;
}
