// 全タイトルのデータ網羅状況を確認する。
// 判定は実際の配合エンジンで行うので、方式ごとに判定を書き分ける必要がない。
// 到達できないモンスターは docs/未到達モンスター.md に書き出され、データ整備の手がかりになる。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';

const REPORT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  '未到達モンスター.md',
);

describe('データ網羅状況', () => {
  // 全タイトル分の逆算をまとめて行うので既定の5秒では足りない
  it('各タイトルの到達率とその内訳', { timeout: 60_000 }, () => {
    const lines: string[] = [
      '# 入手方法が分かっていないモンスター',
      '',
      'アプリのデータ上、配合でも直接入手でも手に入れられないモンスターの一覧です。',
      '配合レシピや入手方法が判明したら、`web/src/data/titles/<タイトル>.json` に追記してください。',
      '',
      '- **レシピも入手方法も無い**: そのモンスターを作る配合が1つも登録されておらず、直接入手もできない',
      '- **素材に到達できない**: 配合レシピはあるが、その材料側にたどり着けない（材料の入手方法が分かれば解決する）',
      '',
      'このファイルは `npm test` を実行すると自動で更新されます。',
      '',
    ];

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
        console.log(`到達できないモンスター ${unreachable.length}体`);
      }

      // 到達できないモンスターをファイルにも残す（調べ物の手がかり用）
      const childIds = new Set([
        ...(data.normalRules ?? []).flatMap((r) => r.childIds),
        ...data.specialRecipes.map((r) => r.childId),
      ]);
      lines.push(`## ${data.name}`, '');
      lines.push(`到達可能 ${reached}/${total}（${pct}%）／未到達 ${unreachable.length}体`, '');
      if (unreachable.length === 0) {
        lines.push('未到達のモンスターはありません。', '');
      } else {
        lines.push('| ランク | モンスター | 系統 | 状況 |', '| --- | --- | --- | --- |');
        for (const m of unreachable) {
          const state = childIds.has(m.id) ? '素材に到達できない' : 'レシピも入手方法も無い';
          lines.push(`| ${m.rank} | ${m.name} | ${familyName(m.familyId)} | ${state} |`);
        }
        lines.push('');
      }

      // どのタイトルも大半のモンスターに到達できることを保証する
      expect(reached / total).toBeGreaterThan(0.85);
    }

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');
  });
});
