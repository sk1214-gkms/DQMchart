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
      '**このアプリのデータ上で**、配合でも直接入手でも手に入れられないモンスターの一覧です。',
      'ゲーム内で本当に入手不可能とは限りません。多くはデータの取りこぼしです',
      '（例: テリワンSPのマンドラは当初ここに載っていましたが、黄金郷の扉でスカウトできると判明しました）。',
      '',
      '配合レシピや入手方法が判明したら `web/src/data/titles/<タイトル>.json` に追記してください。',
      '`npm test` を実行すると、このファイルは自動で更新されます。',
      '',
      '## 表の見方',
      '',
      '- **配信終了で入手不可**: Wi-Fi配信・すれちがい通信・配布コードなどが終了しており、今から入手する手段がない',
      '  → データの不足ではありません。調べても解決しません',
      '- **レシピも入手方法も無い**: そのモンスターを作る配合が1つも登録されておらず、直接入手もできない',
      '  → 調べるべきは「配合レシピ」か「スカウト・タマゴ・イベントなどの入手方法」',
      '- **素材に到達できない**: 配合レシピはあるが、材料側にたどり着けない',
      '  → 調べるべきは材料のほう。「大元の原因」の列にさかのぼった先を出しています',
      '',
      '各タイトルの表の下に「優先して調べたいモンスター」を載せています。',
      'そこが解決すると芋づる式に他のモンスターも到達可能になります。',
      '',
      '## 注意: 配信終了したモンスターについて',
      '',
      'すれちがい通信・Wi-Fi配信・コラボ特典などで配られたモンスターは、配信が終了していると',
      '現在は入手できません。ただしこのアプリは「入手方法が記録されている」ものとして扱うため、',
      'それらを素材にする配合は一覧に出てきません（実際には作れない場合があります）。',
      '',
    ];
    const rates: Array<{ name: string; rate: number }> = [];

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
      const unreachableIds = new Set(unreachable.map((m) => m.id));
      const nameOf = (id: string) => data.monsters.find((x) => x.id === id)?.name ?? id;

      /** そのモンスターのレシピで、到達できない素材を集める */
      const blockersOf = (id: string): string[] => {
        const blockers = new Set<string>();
        for (const recipe of data.specialRecipes) {
          if (recipe.childId !== id) continue;
          for (const p of recipe.parents) {
            if (p.kind === 'monster' && unreachableIds.has(p.monsterId)) blockers.add(p.monsterId);
          }
        }
        return [...blockers];
      };

      /** 素材をたどって、大元で行き止まりになっているモンスターを探す */
      const rootCausesOf = (id: string): string[] => {
        const roots = new Set<string>();
        const seen = new Set<string>();
        const walk = (current: string) => {
          if (seen.has(current)) return;
          seen.add(current);
          const blockers = blockersOf(current);
          if (blockers.length === 0) {
            // これ以上さかのぼれない＝ここが原因
            if (current !== id) roots.add(current);
            else if (!childIds.has(current)) roots.add(current);
            return;
          }
          blockers.forEach(walk);
        };
        walk(id);
        return [...roots];
      };

      lines.push(`## ${data.name}`, '');
      lines.push(`到達可能 ${reached}/${total}（${pct}%）／未到達 ${unreachable.length}体`, '');
      if (unreachable.length === 0) {
        lines.push('未到達のモンスターはありません。', '');
      } else {
        lines.push(
          '| ランク | モンスター | 系統 | 状況 | 直接の原因（到達できない素材） | 大元の原因 |',
          '| --- | --- | --- | --- | --- | --- |',
        );
        for (const m of unreachable) {
          const hasRecipe = childIds.has(m.id);
          const state = m.discontinued
            ? '配信終了で入手不可'
            : hasRecipe
              ? '素材に到達できない'
              : 'レシピも入手方法も無い';
          const blockers = blockersOf(m.id).map(nameOf);
          const roots = rootCausesOf(m.id).map(nameOf);
          const blockerText = hasRecipe
            ? blockers.length
              ? blockers.join('、')
              : '素材は揃うがレシピの条件を満たせない'
            : 'レシピ自体が未登録';
          const rootText = roots.length
            ? roots.filter((r) => r !== m.name).join('、') || '（自身が行き止まり）'
            : '（自身が行き止まり）';
          lines.push(
            `| ${m.rank} | ${m.name} | ${familyName(m.familyId)} | ${state} | ${blockerText} | ${rootText} |`,
          );
        }
        lines.push('');

        // 大元の原因になっているモンスターを集計する（ここを調べれば連鎖的に解決する）
        const rootCount = new Map<string, number>();
        for (const m of unreachable) {
          for (const r of rootCausesOf(m.id)) {
            rootCount.set(r, (rootCount.get(r) ?? 0) + 1);
          }
        }
        const ranked = [...rootCount.entries()]
          .filter(([, n]) => n > 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15);
        if (ranked.length) {
          lines.push('**優先して調べたいモンスター**（これが分かると連鎖的に解決します）', '');
          for (const [id, n] of ranked) {
            lines.push(`- ${nameOf(id)} … ${n}体の入手を塞いでいる`);
          }
          lines.push('');
        }
      }

      // 配信終了で入手できなくなったものを除けば、ほぼ全てに到達できるはず
      const blockedByDiscontinued = unreachable.filter((m) => m.discontinued).length;
      rates.push({ name: data.name, rate: (reached + blockedByDiscontinued) / total });
    }

    // 先にレポートを残す（検証で落ちても原因を追えるようにするため）
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');

    for (const { name, rate } of rates) {
      expect(rate, `${name} の到達率`).toBeGreaterThan(0.9);
    }
  });
});
