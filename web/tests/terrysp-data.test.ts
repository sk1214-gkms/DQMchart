// テリワンSPの実データ検証。位階配合の除外ルールが実データ上で効くかを確かめる。
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { getTitle } from '@/lib/titles';
import type { BreedingPlan, Monster } from '@/lib/engine/types';

const data = getTitle('terrysp');
const engine = getRuleset(data.ruleset);

const m = (id: string): Monster => {
  const found = data.monsters.find((x) => x.id === id);
  if (!found) throw new Error(`データにいないモンスター: ${id}`);
  return found;
};

describe('テリワンSP マスタデータ', () => {
  it('位階が欠番なく1から連番で並ぶ', () => {
    const tiers = data.monsters.map((x) => x.tier!).sort((a, b) => a - b);
    expect(tiers[0]).toBe(1);
    expect(tiers[tiers.length - 1]).toBe(tiers.length);
    expect(new Set(tiers).size).toBe(tiers.length);
  });

  it('特殊配合の子と親がすべてモンスター一覧・系統一覧に存在する', () => {
    const ids = new Set(data.monsters.map((x) => x.id));
    const fams = new Set(data.families.map((f) => f.id));
    for (const recipe of data.specialRecipes) {
      expect(ids.has(recipe.childId)).toBe(true);
      for (const p of recipe.parents) {
        if (p.kind === 'monster') expect(ids.has(p.monsterId)).toBe(true);
        else expect(fams.has(p.familyId)).toBe(true);
      }
    }
  });

  it('位階429以上はすべて位階配合の対象外になっている', () => {
    // 各系統の通常配合上限が位階422〜428で、そこから上は特殊配合でしか作れない
    for (const monster of data.monsters) {
      if ((monster.tier ?? 0) >= 429) expect(monster.tierExcluded).toBe(true);
    }
  });
});

describe('テリワンSP 位階配合', () => {
  it('攻略サイトの実例を再現できる（ドラキー×スライム→マンドラは対象外→タマゴロン）', () => {
    const dracky = m('ドラキー');
    const slime = m('スライム');
    // マンドラはドラキーの1つ上のスライム系だが位階配合では生まれない
    expect(m('マンドラ').tierExcluded).toBe(true);
    expect(m('マンドラ').tier).toBeGreaterThan(dracky.tier!);

    const ids = engine
      .candidates(dracky, slime, data)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    expect(ids).not.toContain('マンドラ');
    expect(ids).toContain('タマゴロン');
  });

  it('位階配合の子は対象外モンスターを含まない', () => {
    const sample = data.monsters.filter((x) => (x.tier ?? 0) < 300).slice(0, 40);
    for (let i = 0; i < sample.length - 1; i += 2) {
      const result = engine.candidates(sample[i], sample[i + 1], data);
      for (const c of result) {
        if (c.method !== 'normal') continue;
        // 親自身はそのまま残るので除外して確認する
        if (c.child.id === sample[i].id || c.child.id === sample[i + 1].id) continue;
        expect(c.child.tierExcluded).toBeFalsy();
      }
    }
  });
});

describe('テリワンSP 逆算プランナー', () => {
  function leaves(plan: BreedingPlan): Monster[] {
    if (plan.kind === 'wild') return [plan.monster];
    return plan.parents.flatMap(leaves);
  }

  it('逆算した配合が実際にその子を生むことを全件検算できる', () => {
    let checked = 0;
    for (const target of data.monsters) {
      const plan = engine.plan(target.id, data);
      if (!plan || plan.kind !== 'breed') continue;
      if (plan.method === 'normal' && plan.parents.length === 2) {
        const ok = engine
          .candidates(plan.parents[0].monster, plan.parents[1].monster, data)
          .some((c) => c.child.id === target.id);
        expect(ok).toBe(true);
        checked += 1;
      }
    }
    // 8割が配合なしで入手できるため、位階配合で逆算される数自体は多くない
    expect(checked).toBeGreaterThan(10);
  });

  it('大半のモンスターに到達ルートがある', () => {
    // 「神獣系」を親に指定するレシピが系統IDに落とせず未収録のため、
    // それを材料とする上位モンスターにも到達できていない
    const reachable = data.monsters.filter((x) => engine.plan(x.id, data) !== null);
    expect(reachable.length / data.monsters.length).toBeGreaterThan(0.85);
  });

  it('逆算の葉はすべて配合なしで入手できる', () => {
    const target = data.monsters.find((x) => engine.plan(x.id, data)?.kind === 'breed')!;
    for (const leaf of leaves(engine.plan(target.id, data)!)) {
      expect(leaf.obtainable).toBe(true);
    }
  });
});
