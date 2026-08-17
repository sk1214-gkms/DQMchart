// マスタデータの網羅性レポート。
// 使い方: node tools/data-report.mjs [titleId]
// 到達不能モンスターや入手手段が空白のモンスターを洗い出し、データ整備の進捗を可視化する。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const titleId = process.argv[2] ?? 'dqm3';
const data = JSON.parse(
  readFileSync(join(here, '..', 'src', 'data', 'titles', `${titleId}.json`), 'utf-8'),
);

const byId = new Map(data.monsters.map((m) => [m.id, m]));
const familyName = (id) => data.families.find((f) => f.id === id)?.name ?? id;
const rankOrder = (id) => data.ranks.find((r) => r.id === id)?.order ?? 99;

// エンジンと同じ考え方で到達可能性だけを判定する簡易プランナー
const memo = new Map();
const visiting = new Set();
function reachable(id) {
  if (memo.has(id)) return memo.get(id);
  if (visiting.has(id)) return false;
  const m = byId.get(id);
  if (!m) return false;
  if (m.obtainable) {
    memo.set(id, true);
    return true;
  }
  visiting.add(id);
  let ok = false;
  for (const recipe of data.specialRecipes) {
    if (recipe.childId !== id) continue;
    if (recipe.parents.length !== 2 && recipe.parents.length !== 4) continue;
    if (
      recipe.parents.every((p) =>
        p.kind === 'monster'
          ? reachable(p.monsterId)
          : data.monsters.some((x) => x.familyId === p.familyId && reachable(x.id)),
      )
    ) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    for (const rule of data.normalRules) {
      if (!rule.childIds.includes(id)) continue;
      const anchor = data.monsters.some(
        (x) => x.familyId === rule.familyA && x.rank === rule.rank && x.id !== id && reachable(x.id),
      );
      const other = data.monsters.some(
        (x) =>
          x.familyId === rule.familyB &&
          rankOrder(x.rank) <= rankOrder(rule.rank) &&
          x.id !== id &&
          reachable(x.id),
      );
      const anchorB = data.monsters.some(
        (x) => x.familyId === rule.familyB && x.rank === rule.rank && x.id !== id && reachable(x.id),
      );
      const otherA = data.monsters.some(
        (x) =>
          x.familyId === rule.familyA &&
          rankOrder(x.rank) <= rankOrder(rule.rank) &&
          x.id !== id &&
          reachable(x.id),
      );
      if ((anchor && other) || (anchorB && otherA)) {
        ok = true;
        break;
      }
    }
  }
  visiting.delete(id);
  memo.set(id, ok);
  return ok;
}

const childIds = new Set([
  ...data.normalRules.flatMap((r) => r.childIds),
  ...data.specialRecipes.map((r) => r.childId),
]);

const wild = data.monsters.filter((m) => m.obtainable);
const orphans = data.monsters.filter((m) => !m.obtainable && !childIds.has(m.id));
const unreachable = data.monsters.filter((m) => !reachable(m.id));

const pct = (n) => `${((n / data.monsters.length) * 100).toFixed(1)}%`;

const countBy = (kind) => data.monsters.filter((m) => m.acquisition === kind).length;

console.log(`=== ${data.name} データレポート ===`);
console.log(`モンスター: ${data.monsters.length}体`);
console.log(`  配合なしで入手可: ${wild.length}体 (${pct(wild.length)})`);
console.log(
  `    野生スカウト ${countBy('wild')}体 / タマゴ ${countBy('egg')}体 / イベント ${countBy('event')}体`,
);
console.log(`通常配合: ${data.normalRules.length}エントリ`);
console.log(
  `特殊配合: ${data.specialRecipes.length}件 (うち4体配合 ${
    data.specialRecipes.filter((r) => r.parents.length === 4).length
  }件)`,
);
console.log(`到達可能: ${data.monsters.length - unreachable.length}体 (${pct(data.monsters.length - unreachable.length)})`);
console.log('');

if (orphans.length) {
  console.log(`■ 入手手段が空白（野生でも配合でも入手できない）: ${orphans.length}体`);
  for (const m of orphans) console.log(`  ${m.name} (${m.rank}・${familyName(m.familyId)})`);
  console.log('');
}

const indirect = unreachable.filter((m) => !orphans.includes(m));
if (indirect.length) {
  console.log(`■ レシピはあるが材料に到達できない: ${indirect.length}体`);
  for (const m of indirect.slice(0, 30)) {
    console.log(`  ${m.name} (${m.rank}・${familyName(m.familyId)})`);
  }
  if (indirect.length > 30) console.log(`  ... 他${indirect.length - 30}体`);
}

process.exitCode = 0;
