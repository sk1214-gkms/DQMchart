// イルルカSPの実データ検証。位階配合が実データ上でも破綻しないかを確かめる。
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { getTitle } from '@/lib/titles';
import type { BreedingPlan, Monster } from '@/lib/engine/types';

const data = getTitle('iruruka');
const engine = getRuleset(data.ruleset);

describe('イルルカSP マスタデータ', () => {
  it('位階が全モンスターに付いていて重複しない', () => {
    const tiers = data.monsters.map((x) => x.tier);
    expect(tiers.every((t) => typeof t === 'number')).toBe(true);
    expect(new Set(tiers).size).toBe(tiers.length);
  });

  it('系統組み合わせ表が7系統すべての組み合わせを覆っている', () => {
    // ？？？系は攻略サイトの系統表（7×7）に載っていないため対象外。
    // ？？？系が親の場合、別系統の子（候補3）は出さない扱いにしている。
    const fams = data.families.map((f) => f.id).filter((id) => id !== 'unknown');
    expect(fams).toHaveLength(7);
    for (const a of fams) {
      for (const b of fams) {
        const hit = (data.familyPairs ?? []).some(
          (r) =>
            (r.familyA === a && r.familyB === b) || (r.familyA === b && r.familyB === a),
        );
        expect(hit).toBe(true);
      }
    }
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

  it('ランクと位階はおおむね対応する（例外は少数に留まる）', () => {
    const rankOrder = (rank: string) => data.ranks.find((r) => r.id === rank)!.order;
    const sorted = [...data.monsters].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
    let inversions = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (rankOrder(sorted[i].rank) < rankOrder(sorted[i - 1].rank)) inversions += 1;
    }
    // 位階がひとつ上のランク帯に食い込む例外が実在する（3体程度）
    expect(inversions).toBeLessThan(10);
  });
});

describe('イルルカSP 位階配合', () => {
  it('異系統配合では強い親より位階が上の子が出る', () => {
    const slime = data.monsters.find((x) => x.familyId === 'slime' && (x.tier ?? 0) < 100)!;
    const dragon = data.monsters.find((x) => x.familyId === 'dragon' && (x.tier ?? 0) < 100)!;
    const strongTier = Math.max(slime.tier ?? 0, dragon.tier ?? 0);
    const weakTier = Math.min(slime.tier ?? 0, dragon.tier ?? 0);

    const children = engine
      .candidates(slime, dragon, data)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child)
      .filter((c) => c.id !== slime.id && c.id !== dragon.id);

    expect(children.length).toBeGreaterThan(0);
    // 親自身を除く候補は、少なくとも弱いほうの親より位階が上
    for (const child of children) {
      expect(child.tier ?? 0).toBeGreaterThan(weakTier);
    }
    // 親と同じ系統の候補は強いほうの親より上
    for (const child of children) {
      if (child.familyId === slime.familyId || child.familyId === dragon.familyId) {
        expect(child.tier ?? 0).toBeGreaterThan(strongTier);
      }
    }
  });

  it('同系統配合の候補は親自身＋1種類までに収まる', () => {
    const list = data.monsters.filter((x) => x.familyId === 'slime').slice(0, 2);
    const result = engine
      .candidates(list[0], list[1], data)
      .filter((c) => c.method === 'normal');
    expect(result.length).toBeLessThanOrEqual(3); // 親2体＋1種類
  });

  it('系統の最上位からはそれ以上の子が生まれない', () => {
    const top = [...data.monsters]
      .filter((x) => x.familyId === 'slime')
      .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))[0];
    const children = engine
      .candidates(top, top, data)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    expect(children).toEqual([top.id]);
  });
});

describe('イルルカSP 逆算プランナー', () => {
  function leaves(plan: BreedingPlan): Monster[] {
    if (plan.kind === 'wild') return [plan.monster];
    return plan.parents.flatMap(leaves);
  }

  it('入手できるモンスターは葉として返る', () => {
    const wild = data.monsters.find((x) => x.obtainable)!;
    expect(engine.plan(wild.id, data)?.kind).toBe('wild');
  });

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
    expect(checked).toBeGreaterThan(50);
  });

  it('大半のモンスターに到達ルートがある', () => {
    const reachable = data.monsters.filter((x) => engine.plan(x.id, data) !== null);
    expect(reachable.length / data.monsters.length).toBeGreaterThan(0.8);
  });

  it('逆算の葉はすべて配合なしで入手できる', () => {
    const target = data.monsters.find((x) => {
      const plan = engine.plan(x.id, data);
      return plan?.kind === 'breed';
    })!;
    for (const leaf of leaves(engine.plan(target.id, data)!)) {
      expect(leaf.obtainable).toBe(true);
    }
  });
});
