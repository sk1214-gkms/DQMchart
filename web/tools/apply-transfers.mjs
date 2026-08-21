// 作品間の「引っ越し」「通信交換」を入手方法に反映する。
//
// 使い方:
//   node tools/apply-transfers.mjs [--write]
//
// シリーズは前作から次作へモンスターを連れていける。ある作品で配信終了などで
// 入手できないモンスターでも、連れてこられる作品側で手に入るなら今でも入手できる。
// 経路は各タイトルJSONの transfersFrom に持たせてある。
//
// 経路は多段につながる（ジョーカー2 → テリワン3D → イルルカ → ジョーカー3プロ）ので、
// 「連れてきた結果さらに連れていける」までたどる。そのため到達判定を
// 変化がなくなるまで繰り返す。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset } from './engine-bridge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'src', 'data', 'titles');
const write = process.argv.includes('--write');

/** 引っ越しで入手できることにした印。付け直しできるように目印を残す */
const MARK = '【他作品から】';

const titles = new Map();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
  titles.set(data.id, { file, data });
}

// 前回の実行で付けたものを一旦外す（経路やデータが変わったときに残らないように）
for (const { data } of titles.values()) {
  for (const m of data.monsters) {
    if (m.acquisition === 'transfer' || (m.acquisitionDetail ?? '').startsWith(MARK)) {
      delete m.obtainable;
      delete m.acquisition;
      delete m.acquisitionDetail;
      m.discontinued = true; // 元は「入手できない」状態だったので戻す
    }
  }
}

/**
 * その作品で今このモンスターが手に入るか（配合も含めて到達できるか）。
 * エンジンはデータのオブジェクトをキーに逆算結果をキャッシュするので、
 * 中身を書き換えたあとは新しいオブジェクトとして渡す必要がある。
 */
function reachableSet(data) {
  const engine = getRuleset(data.ruleset);
  const fresh = { ...data };
  const out = new Set();
  for (const m of fresh.monsters) {
    if (engine.plan(m.id, fresh)) out.add(m.id);
  }
  return out;
}

const applied = [];
/**
 * 1周分。deadEndOnly のときは「そのモンスターを作るレシピが1つも無い」ものだけを対象にする。
 * 素材さえ連れてくれば自力で配合できるモンスターまで連れてくる形にならないよう、
 * まず行き止まりだけを埋めて、配合で繋がるかを見てから残りを埋める。
 */
function pass(deadEndOnly) {
  const reachable = new Map();
  for (const [id, { data }] of titles) reachable.set(id, reachableSet(data));

  let changed = 0;
  for (const [id, { data }] of titles) {
    const rules = data.transfersFrom ?? [];
    if (!rules.length) continue;
    const rankOrder = new Map(data.ranks.map((r) => [r.id, r.order]));
    const here = reachable.get(id);
    const hasRecipe = new Set(data.specialRecipes.map((r) => r.childId));

    for (const m of data.monsters) {
      if (here.has(m.id)) continue; // もう手に入るなら何もしない
      if (deadEndOnly && hasRecipe.has(m.id)) continue;

      for (const rule of rules) {
        const from = titles.get(rule.titleId);
        if (!from) {
          console.log(`  ！ ${data.name}: 引き継ぎ元 ${rule.titleId} が見つからない`);
          continue;
        }
        // 連れてくる側にそのモンスターが居て、かつそちらで手に入ること
        if (!reachable.get(rule.titleId).has(m.id)) continue;
        // ランクの上限（連れていく先のランクで判定する）
        if (rule.maxRankId !== undefined) {
          const limit = rankOrder.get(rule.maxRankId);
          const mine = rankOrder.get(m.rank);
          if (limit === undefined || mine === undefined || mine > limit) continue;
        }
        // 連れてくる元のランクにも上限がある場合（作品ごとにランクが違うので両側を見る）
        if (rule.maxSourceRankId !== undefined) {
          const order = new Map(from.data.ranks.map((r) => [r.id, r.order]));
          const there = from.data.monsters.find((x) => x.id === m.id);
          const limit = order.get(rule.maxSourceRankId);
          const theirs = there ? order.get(there.rank) : undefined;
          if (limit === undefined || theirs === undefined || theirs > limit) continue;
        }

        m.obtainable = true;
        m.acquisition = 'transfer';
        m.acquisitionDetail = `${MARK}${from.data.name}で入手して${rule.note}`;
        delete m.discontinued;
        applied.push(`${data.name}: ${m.name}（← ${from.data.name}）`);
        changed += 1;
        break;
      }
    }
  }
  return changed;
}

for (const deadEndOnly of [true, false]) {
  const label = deadEndOnly ? 'レシピが無いもの' : '残り';
  for (let round = 1; round <= 12; round++) {
    const changed = pass(deadEndOnly);
    console.log(`${label} ${round}周目: ${changed}体を追加`);
    if (changed === 0) break;
    if (round === 12) console.log('  ！ 繰り返しが収束しないので打ち切る');
  }
}

console.log(`\n引っ越しで入手できるようになった: ${applied.length}体`);
const byTitle = new Map();
for (const a of applied) {
  const [t] = a.split(':');
  byTitle.set(t, (byTitle.get(t) ?? 0) + 1);
}
for (const [t, n] of byTitle) console.log(`  ${t}: ${n}体`);
for (const a of applied.slice(0, 40)) console.log(`    ${a}`);
if (applied.length > 40) console.log(`    ... 他${applied.length - 40}体`);

if (write) {
  for (const { file, data } of titles.values()) {
    writeFileSync(join(dir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  }
  console.log('\n書き込み完了');
} else {
  console.log('\n(--write を付けると書き込み)');
}
