// マスタデータの矛盾を機械的に洗い出す。
// 攻略サイトからの収集で混入しがちな誤り（自己参照・重複・ランクや位階の逆転など）を検出する。
// 検出結果は docs/データ検証レポート.md に書き出す。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listTitles } from '@/lib/titles';
import type { TitleData } from '@/lib/engine/types';

const REPORT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'データ検証レポート.md',
);

type Issue = { level: '要確認' | '参考'; kind: string; detail: string };

function checkTitle(data: TitleData): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(data.monsters.map((m) => [m.id, m]));
  const rankOrder = (rank: string) => data.ranks.find((r) => r.id === rank)?.order ?? -1;
  const parentsOf = (recipe: (typeof data.specialRecipes)[number]) =>
    recipe.parents.flatMap((p) => (p.kind === 'monster' ? [byId.get(p.monsterId)!] : []));

  // --- 1. 自分自身を素材にするレシピ ---
  for (const r of data.specialRecipes) {
    if (r.parents.some((p) => p.kind === 'monster' && p.monsterId === r.childId)) {
      issues.push({
        level: '要確認',
        kind: '自己参照レシピ',
        detail: `${r.childId} が自分自身を素材にしている`,
      });
    }
  }

  // --- 2. 同じ子・同じ素材のレシピが重複 ---
  const seen = new Map<string, number>();
  for (const r of data.specialRecipes) {
    const key = `${r.childId}|${JSON.stringify(
      [...r.parents].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    )}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen) {
    if (n > 1) {
      issues.push({
        level: '参考',
        kind: 'レシピ重複',
        detail: `${key.split('|')[0]} に同じ素材のレシピが${n}件`,
      });
    }
  }

  // --- 3. 親の数が2でも4でもないレシピ ---
  for (const r of data.specialRecipes) {
    if (r.parents.length !== 2 && r.parents.length !== 4) {
      issues.push({
        level: '要確認',
        kind: '素材の数が不正',
        detail: `${r.childId} の素材が${r.parents.length}体（2体か4体のはず）`,
      });
    }
  }

  // --- 4. 子が素材より下位ランクになっている（配合は基本的に格上げ） ---
  for (const r of data.specialRecipes) {
    const parents = parentsOf(r);
    if (parents.length === 0) continue;
    const child = byId.get(r.childId);
    if (!child) continue;
    const maxParent = Math.max(...parents.map((p) => rankOrder(p.rank)));
    if (rankOrder(child.rank) < maxParent - 1) {
      issues.push({
        level: '参考',
        kind: '子のランクが素材より低い',
        detail: `${child.name}(${child.rank}) ← ${parents.map((p) => `${p.name}(${p.rank})`).join(' × ')}`,
      });
    }
  }

  // --- 5. 位階配合方式で、子の位階が素材より低い ---
  if (data.monsters.some((m) => m.tier !== undefined)) {
    for (const r of data.specialRecipes) {
      const parents = parentsOf(r).filter((p) => p.tier !== undefined);
      const child = byId.get(r.childId);
      if (!child || child.tier === undefined || parents.length === 0) continue;
      const maxParent = Math.max(...parents.map((p) => p.tier!));
      if (child.tier < maxParent) {
        issues.push({
          level: '参考',
          kind: '子の位階が素材より低い',
          detail: `${child.name}(位階${child.tier}) ← ${parents
            .map((p) => `${p.name}(位階${p.tier})`)
            .join(' × ')}`,
        });
      }
    }
  }

  // --- 6. 入手方法があるのに種別が無い / 詳細が空 ---
  for (const m of data.monsters) {
    if (!m.obtainable) continue;
    if (!m.acquisition) {
      issues.push({ level: '要確認', kind: '入手手段の種別が無い', detail: m.name });
    }
    if (!m.acquisitionDetail) {
      issues.push({ level: '参考', kind: '入手方法の詳細が空', detail: m.name });
    }
  }

  // --- 7. 位階の重複・欠番 ---
  const tiers = data.monsters.map((m) => m.tier).filter((t): t is number => t !== undefined);
  if (tiers.length > 0) {
    const dup = new Map<number, string[]>();
    for (const m of data.monsters) {
      if (m.tier === undefined) continue;
      dup.set(m.tier, [...(dup.get(m.tier) ?? []), m.name]);
    }
    for (const [tier, names] of dup) {
      if (names.length > 1) {
        issues.push({
          level: '要確認',
          kind: '位階の重複',
          detail: `位階${tier}: ${names.join('、')}`,
        });
      }
    }
  }

  // --- 8. 同じ名前のモンスターが複数 ---
  const nameCount = new Map<string, number>();
  for (const m of data.monsters) nameCount.set(m.name, (nameCount.get(m.name) ?? 0) + 1);
  for (const [name, n] of nameCount) {
    if (n > 1) issues.push({ level: '要確認', kind: 'モンスター名の重複', detail: `${name}（${n}件）` });
  }

  return issues;
}

describe('マスタデータの矛盾チェック', () => {
  it('全タイトルを検証する', { timeout: 60_000 }, () => {
    const lines: string[] = [
      '# データ検証レポート',
      '',
      'マスタデータの矛盾を機械的に洗い出した結果です。`npm test` で自動更新されます。',
      '',
      '- **要確認**: データの誤りである可能性が高いもの',
      '- **参考**: ゲームの仕様上ありえる例外かもしれないもの（メタル系のランク跳ねなど）',
      '',
    ];

    let criticalTotal = 0;
    for (const data of listTitles()) {
      const issues = checkTitle(data);
      const critical = issues.filter((i) => i.level === '要確認');
      criticalTotal += critical.length;

      lines.push(`## ${data.name}`, '');
      lines.push(
        `モンスター ${data.monsters.length}体 / 特殊配合 ${data.specialRecipes.length}件`,
        '',
      );
      if (issues.length === 0) {
        lines.push('矛盾は見つかりませんでした。', '');
        continue;
      }

      // 種類ごとにまとめる
      const byKind = new Map<string, Issue[]>();
      for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
      for (const [kind, list] of [...byKind.entries()].sort()) {
        lines.push(`### ${kind}（${list[0].level}）… ${list.length}件`, '');
        for (const i of list.slice(0, 25)) lines.push(`- ${i.detail}`);
        if (list.length > 25) lines.push(`- … 他${list.length - 25}件`);
        lines.push('');
      }
    }

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');

    console.log(`要確認の項目: ${criticalTotal}件（詳細は docs/データ検証レポート.md）`);
    // 明らかな破綻（自己参照・位階重複・名前重複など）は無いことを保証する
    expect(criticalTotal).toBe(0);
  });
});
