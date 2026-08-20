// 追加調査で判明した入手方法・配合レシピを、タイトルのマスタデータに反映する。
//
// 使い方:
//   node tools/apply-supplement.mjs <タイトルID> <補完JSONのパス> [--write]
//   例: node tools/apply-supplement.mjs terrysp ../scratchpad/terrysp_missing.json --write
//
// 補完JSONの形式:
//   { "obtainable": [{ name, method, detail }], "recipes": [{ child, kind, parents, notes }] }
//   parents の要素は { type: "monster"|"family"|"any", name }
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [titleId, supplementPath, ...flags] = process.argv.slice(2);
if (!titleId || !supplementPath) {
  console.error('使い方: node tools/apply-supplement.mjs <タイトルID> <補完JSON> [--write]');
  process.exit(1);
}

const titlePath = join(here, '..', 'src', 'data', 'titles', `${titleId}.json`);
const data = JSON.parse(readFileSync(titlePath, 'utf-8'));
const supplement = JSON.parse(readFileSync(supplementPath, 'utf-8'));

const FAMILY_MAP = {
  スライム系: 'slime',
  ドラゴン系: 'dragon',
  しぜん系: 'nature',
  自然系: 'nature',
  まじゅう系: 'beast',
  魔獣系: 'beast',
  ぶっしつ系: 'material',
  物質系: 'material',
  あくま系: 'demon',
  悪魔系: 'demon',
  ゾンビ系: 'zombie',
  '？？？系': 'unknown',
  ブレイク系: 'break',
};

const byId = new Map(data.monsters.map((m) => [m.id, m]));

/** 表記ゆれ（中黒・全角半角）を吸収して名前を解決する */
function resolve(name) {
  const raw = name.trim();
  const candidates = [
    raw,
    raw.replace(/・/g, '').replace(/&/g, '＆'),
    raw.replace(/[0-9]/g, (d) => '０１２３４５６７８９'[Number(d)]),
  ];
  for (const c of candidates) if (byId.has(c)) return c;
  const stripped = raw.replace(/・/g, '');
  for (const id of byId.keys()) if (id.replace(/・/g, '') === stripped) return id;
  return null;
}

const report = { obtainable: 0, recipes: 0, skipped: [] };

for (const o of supplement.obtainable ?? []) {
  const id = resolve(o.name);
  if (!id) {
    report.skipped.push(`入手方法: ${o.name}（一覧に無い）`);
    continue;
  }
  const target = byId.get(id);
  const detail = (o.detail ?? '').trim();
  if (target.obtainable) {
    // 既に入手方法がある場合は詳細だけ足す
    if (detail && !(target.acquisitionDetail ?? '').includes(detail)) {
      target.acquisitionDetail = `${target.acquisitionDetail ?? ''} / ${detail}`.replace(/^ \/ /, '');
    }
    continue;
  }
  target.obtainable = true;
  target.acquisition = o.method === 'egg' ? 'egg' : o.method === 'wild' ? 'wild' : 'event';
  if (detail) target.acquisitionDetail = detail;
  report.obtainable += 1;
}

const existingKeys = new Set(
  data.specialRecipes.map((r) => `${r.childId}|${JSON.stringify(r.parents)}`),
);
// 何度も補完を流し込むとIDがぶつかるので、既に使われている番号は飛ばす
const usedIds = new Set(data.specialRecipes.map((r) => r.id));
function newId(childId) {
  for (let n = 0; ; n++) {
    const id = `sp_add_${n.toString().padStart(3, '0')}_${childId}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
}

for (const r of supplement.recipes ?? []) {
  const childId = resolve(r.child);
  if (!childId) {
    report.skipped.push(`レシピ: ${r.child}（一覧に無い）`);
    continue;
  }
  const parents = [];
  let ok = true;
  for (const p of r.parents ?? []) {
    if (p.type === 'monster') {
      const id = resolve(p.name);
      if (!id) {
        report.skipped.push(`レシピ ${r.child} の親: ${p.name}（一覧に無い）`);
        ok = false;
        break;
      }
      parents.push({ kind: 'monster', monsterId: id });
    } else if (p.type === 'family') {
      const familyId = FAMILY_MAP[p.name?.trim()];
      if (!familyId) {
        report.skipped.push(`レシピ ${r.child} の系統: ${p.name}（未知）`);
        ok = false;
        break;
      }
      const parent = { kind: 'family', familyId };
      // 「自然系のSランク以上」のようにランクの下限が付くことがある
      if (p.minRank) {
        if (!data.ranks.some((r) => r.id === p.minRank)) {
          report.skipped.push(`レシピ ${r.child} のランク: ${p.minRank}（未知）`);
          ok = false;
          break;
        }
        parent.minRankId = p.minRank;
      }
      parents.push(parent);
    } else if (p.type === 'any') {
      parents.push({ kind: 'any' });
    } else {
      report.skipped.push(`レシピ ${r.child}: 未知の親タイプ ${p.type}`);
      ok = false;
      break;
    }
  }
  if (!ok) continue;

  const key = `${childId}|${JSON.stringify(parents)}`;
  if (existingKeys.has(key)) continue;
  existingKeys.add(key);

  const entry = { id: newId(childId), childId, parents };
  const note = [r.notes, r.kind === '4体' ? '4体配合' : ''].filter(Boolean).join(' ').trim();
  if (note) entry.note = note;
  data.specialRecipes.push(entry);
  report.recipes += 1;
}

console.log(`=== ${data.name} ===`);
console.log(`入手方法を追加: ${report.obtainable}体`);
console.log(`配合レシピを追加: ${report.recipes}件`);
if (report.skipped.length) {
  console.log(`反映できなかったもの: ${report.skipped.length}件`);
  for (const s of report.skipped.slice(0, 20)) console.log(`  ${s}`);
  if (report.skipped.length > 20) console.log(`  ... 他${report.skipped.length - 20}件`);
}

if (flags.includes('--write')) {
  writeFileSync(titlePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  console.log(`書き込み完了: ${titlePath}`);
} else {
  console.log('(--write を付けると書き込み)');
}
