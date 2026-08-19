// 全タイトルのデータ網羅状況を確認する。
// 判定は実際の配合エンジンで行うので、方式ごとに判定を書き分ける必要がない。
// 到達できないモンスターは一覧で出力されるので、データ整備の手がかりになる。
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';

describe('データ網羅状況', () => {
  // 全タイトル分の逆算をまとめて行うので既定の5秒では足りない
  it('各タイトルの到達率とその内訳', { timeout: 60_000 }, () => {
    for (const data of listTitles()) {
      const engine = getRuleset(data.ruleset);
      const familyName = (id: string) => data.families.find((f) => f.id === id)?.name ?? id;

      const counts = { wild: 0, normal: 0, special: 0, quad: 0 };
      const unreachable: typeof data.monsters = [];
      for (const m of data.monsters) {
        const plan = engine.plan(m.id, data);
        if (!plan) {
          unreachable.push(m);
          continue;
        }
        if (plan.kind === 'wild') counts.wild += 1;
        else if (plan.method === 'special') counts.special += 1;
        else if (plan.method === 'quad') counts.quad += 1;
        else counts.normal += 1;
      }

      const total = data.monsters.length;
      const reached = total - unreachable.length;
      const pct = ((reached / total) * 100).toFixed(1);
      console.log(`\n=== ${data.name} ===`);
      console.log(`到達可能 ${reached}/${total} (${pct}%)`);
      console.log(
        `  直接入手 ${counts.wild} / 通常・位階配合 ${counts.normal} / 特殊配合 ${counts.special} / 4体配合 ${counts.quad}`,
      );
      console.log(`特殊配合レシピ ${data.specialRecipes.length}件`);
      if (unreachable.length) {
        console.log(`到達できないモンスター ${unreachable.length}体:`);
        for (const m of unreachable.slice(0, 40)) {
          console.log(`  ${m.rank}\t${m.name}\t${familyName(m.familyId)}`);
        }
        if (unreachable.length > 40) console.log(`  ... 他${unreachable.length - 40}体`);
      }

      // どのタイトルも大半のモンスターに到達できることを保証する
      expect(reached / total).toBeGreaterThan(0.85);
    }
  });
});
