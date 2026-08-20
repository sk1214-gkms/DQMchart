// 調査で集めたモンスター一覧・配合レシピから、タイトルのマスタデータJSONを新規に作る。
//
// 使い方:
//   node tools/build-title.mjs <収集JSONのパス> [--write]
//   例: node tools/build-title.mjs ../scratchpad/dqmj2p_data.json --write
//
// 収集JSONの形式:
//   {
//     id, name, ruleset,           // 省略時はコマンドラインで指定を促す
//     ranks: ["F","E",...],
//     families: [{ id, name }],
//     monsters: [{ name, family, rank, tier, obtainable, method, detail, tierExcluded }],
//     recipes:  [{ child, kind, parents: [{ type, name, minRank, maxRank }] }],
//     groups:   { "神獣": ["スペディオ", ...] }   // 親の type:"group" で参照する
//   }
//
// 「どれか1体でよい」という親（神獣など）はデータの形では表せないので、
// 構成員ごとのレシピに展開する。
//
// 系統の掛け合わせ表（familyPairs）はジョーカー1からイルルカまで共通なので、
// イルルカSPのものをそのまま流用する。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [sourcePath, ...flags] = process.argv.slice(2);
if (!sourcePath) {
  console.error('使い方: node tools/build-title.mjs <収集JSON> [--write]');
  process.exit(1);
}

const src = JSON.parse(readFileSync(sourcePath, 'utf-8'));
for (const key of ['id', 'name', 'ruleset', 'ranks', 'families', 'monsters']) {
  if (!src[key]) {
    console.error(`収集JSONに ${key} がありません`);
    process.exit(1);
  }
}

const titlePath = join(here, '..', 'src', 'data', 'titles', `${src.id}.json`);
if (existsSync(titlePath) && !flags.includes('--force')) {
  console.error(`${titlePath} は既にあります。上書きするなら --force を付けてください`);
  process.exit(1);
}

// 位階配合の系統の掛け合わせ表はシリーズを通して変わらないので使い回す
const familyPairs = JSON.parse(
  readFileSync(join(here, '..', 'src', 'data', 'titles', 'iruruka.json'), 'utf-8'),
).familyPairs;

const problems = [];
const familyIds = new Set(src.families.map((f) => f.id));
const familyByName = new Map(src.families.map((f) => [f.name, f.id]));
const rankIds = new Set(src.ranks);

/** 系統は id でも名前でも受け取れるようにする */
function familyIdOf(value, where) {
  const v = (value ?? '').trim();
  if (familyIds.has(v)) return v;
  const byName = familyByName.get(v);
  if (byName) return byName;
  problems.push(`${where}: 系統「${value}」が families にない`);
  return null;
}

const monsters = [];
const seen = new Set();
for (const m of src.monsters) {
  const name = (m.name ?? '').trim();
  if (!name) {
    problems.push('名前の無いモンスターがある');
    continue;
  }
  if (seen.has(name)) {
    problems.push(`モンスター「${name}」が重複している`);
    continue;
  }
  seen.add(name);

  const familyId = familyIdOf(m.family ?? m.familyId, `モンスター ${name}`);
  if (!familyId) continue;
  if (!rankIds.has(m.rank)) problems.push(`モンスター ${name}: 未知のランク「${m.rank}」`);

  const entry = { id: name, name, familyId, rank: m.rank };
  if (m.tier !== null && m.tier !== undefined) entry.tier = m.tier;
  else problems.push(`モンスター ${name}: 位階が不明`);
  if (m.obtainable) {
    entry.obtainable = true;
    entry.acquisition = m.method === 'egg' ? 'egg' : m.method === 'wild' ? 'wild' : 'event';
    if (m.detail) entry.acquisitionDetail = m.detail.trim();
  }
  if (m.tierExcluded) entry.tierExcluded = true;
  if (m.discontinued) entry.discontinued = true;
  monsters.push(entry);
}

const groups = src.groups ?? {};

/** 親1体分の条件を、データの形に直す。「どれか1体」は複数返す */
function parentVariants(p, childId) {
  if (p.type === 'any') return [{ kind: 'any' }];
  if (p.type === 'group') {
    const members = groups[p.name] ?? groups[(p.name ?? '').split(/[(（]/)[0].trim()];
    if (!members?.length) {
      problems.push(`レシピ ${childId}: グループ「${p.name}」の構成員が groups にない`);
      return [];
    }
    const missing = members.filter((n) => !seen.has(n.trim()));
    for (const n of missing) problems.push(`グループ「${p.name}」の${n}がモンスター一覧にない`);
    return members
      .filter((n) => seen.has(n.trim()))
      .map((n) => ({ kind: 'monster', monsterId: n.trim() }));
  }
  if (p.type === 'family' || p.type === 'condition') {
    // condition は「自然系Sランク以上」のように系統とランク条件が1つの文字列になっている
    let name = p.name ?? '';
    let minRank = p.minRank;
    let maxRank = p.maxRank;
    if (p.type === 'condition') {
      const m = name.match(/^(.+?系)\s*([A-Z]{1,2})ランク(以上|以下)$/);
      if (!m) {
        problems.push(`レシピ ${childId}: 条件「${name}」を読み取れない`);
        return [];
      }
      name = m[1];
      if (m[3] === '以上') minRank = m[2];
      else maxRank = m[2];
    }
    const familyId = familyIdOf(name, `レシピ ${childId} の親`);
    if (!familyId) return [];
    const parent = { kind: 'family', familyId };
    for (const [rank, key] of [
      [minRank, 'minRankId'],
      [maxRank, 'maxRankId'],
    ]) {
      if (!rank) continue;
      if (!rankIds.has(rank)) {
        problems.push(`レシピ ${childId}: 未知のランク「${rank}」`);
        return [];
      }
      parent[key] = rank;
    }
    return [parent];
  }
  const monsterId = (p.name ?? '').trim();
  if (!seen.has(monsterId)) {
    problems.push(`レシピ ${childId} の親「${p.name}」がモンスター一覧にない`);
    return [];
  }
  return [{ kind: 'monster', monsterId }];
}

const specialRecipes = [];
const recipeKeys = new Set();
for (const [i, r] of (src.recipes ?? []).entries()) {
  const childId = (r.child ?? '').trim();
  if (!seen.has(childId)) {
    problems.push(`レシピ${i}: 子「${r.child}」がモンスター一覧にない`);
    continue;
  }
  // 親ごとの候補を組み合わせて、具体的なレシピに展開する
  let combos = [[]];
  for (const p of r.parents ?? []) {
    const variants = parentVariants(p, childId);
    if (!variants.length) {
      combos = [];
      break;
    }
    combos = combos.flatMap((base) => variants.map((v) => [...base, v]));
  }

  for (const parents of combos) {
    if (parents.length !== 2 && parents.length !== 4) {
      problems.push(`レシピ ${childId}: 親が${parents.length}体（2体か4体のみ対応）`);
      break;
    }
    // 自分自身を親にするレシピは意味がないので落とす
    if (parents.some((p) => p.kind === 'monster' && p.monsterId === childId)) continue;

    const key = `${childId}|${JSON.stringify(parents)}`;
    if (recipeKeys.has(key)) continue; // 同じ内容のレシピは1つにまとめる
    recipeKeys.add(key);

    const entry = {
      id: `sp_${String(specialRecipes.length).padStart(3, '0')}_${childId}`,
      childId,
      parents,
    };
    if (r.notes) entry.note = r.notes.trim();
    specialRecipes.push(entry);
  }
}

const data = {
  id: src.id,
  name: src.name,
  ruleset: src.ruleset,
  ranks: src.ranks.map((id, order) => ({ id, order })),
  families: src.families,
  monsters,
  familyPairs,
  specialRecipes,
};

console.log(`=== ${data.name} ===`);
console.log(`モンスター ${monsters.length}体 / 特殊配合 ${specialRecipes.length}件`);
console.log(`  位階あり ${monsters.filter((m) => m.tier !== undefined).length}体`);
console.log(`  直接入手できる ${monsters.filter((m) => m.obtainable).length}体`);
console.log(`  位階配合では生まれない ${monsters.filter((m) => m.tierExcluded).length}体`);
console.log(`  4体配合 ${specialRecipes.filter((r) => r.parents.length === 4).length}件`);
if (problems.length) {
  console.log(`\n気になる点 ${problems.length}件:`);
  for (const p of problems.slice(0, 30)) console.log(`  ${p}`);
  if (problems.length > 30) console.log(`  ... 他${problems.length - 30}件`);
}

if (flags.includes('--write')) {
  writeFileSync(titlePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  console.log(`\n書き込み完了: ${titlePath}`);
  console.log('src/lib/titles.ts への登録を忘れずに');
} else {
  console.log('\n(--write を付けると書き込み)');
}
