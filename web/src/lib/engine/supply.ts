// 「そのモンスターを何体も用意できるか」の判定。
//
// 配合は親を消費するので、素材が10体要るなら10体そろえる必要がある。
// 野生でスカウトできるモンスターなら何体でも用意できるが、
// ストーリーで1体もらえるだけのモンスターは何体も用意できない。
//
// 手数だけで最短を選ぶと、位階の低いイベント限定モンスターが
// 相方として毎回選ばれてしまう（イルルカSPのモントナーは位階1で
// 全モンスターの相方になれるため、31体必要という手順が出ていた）。
import type { BreedingRuleset, Monster, TitleData } from './types';

/**
 * 説明文に出てくる「繰り返し手に入る」手段。
 * acquisition は代表的な手段しか持っていないので（「イベントの景品、かつタマゴからも」
 * のようなモンスターがいる）、説明文も見て判断する。
 */
const REPEATABLE_HINTS =
  /タマゴ|たまご|他国マスター|スカウト|出現|ごとに|何度|繰り返|勝ち抜き|すれちがい|通信|ショップ|購入|交換/;

/**
 * 何体でも用意できるか。
 *
 * engine と data を渡すと「配合でも作れるか」まで見る。
 * 1体しかもらえないモンスターでも、配合で作れるなら何体でも用意できる。
 */
export function repeatable(m: Monster, engine?: BreedingRuleset, data?: TitleData): boolean {
  // 配合で作るものは、素材さえあれば何体でも作れる
  if (!m.obtainable) return true;
  // 野生スカウトとタマゴは繰り返し入手できる。
  // 引っ越しも元のソフトから消えない方式なので繰り返せる。
  if (m.acquisition === 'wild' || m.acquisition === 'egg' || m.acquisition === 'transfer') {
    return true;
  }
  // イベントでも、タマゴや他国マスターから何度でも入手できるものがある
  if (REPEATABLE_HINTS.test(m.acquisitionDetail ?? '')) return true;
  // もらえるのは1体でも、配合で作れるなら増やせる
  if (engine && data) return engine.planByBreeding(m.id, data) !== null;
  return false;
}

/**
 * 素材としての選びやすさ。小さいほど優先。
 * 手数が同じなら、何体でも用意できるモンスターを選ぶ。
 */
export function supplyPenalty(m: Monster): number {
  return repeatable(m) ? 0 : 1;
}
