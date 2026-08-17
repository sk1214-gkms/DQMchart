import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { getTitle } from '@/lib/titles';
import type { BreedingPlan, Monster } from '@/lib/engine/types';

const data = getTitle('dqm3');
const engine = getRuleset(data.ruleset);

function m(id: string): Monster {
  const found = data.monsters.find((x) => x.id === id);
  if (!found) throw new Error(`テストデータにいないモンスター: ${id}`);
  return found;
}

describe('DQM3 通常配合', () => {
  it('同ランクの系統ペアから子候補が出る（スライム系G×ドラゴン系G）', () => {
    const result = engine.candidates(m('slime'), m('kodora'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id);
    expect(ids).toContain('hane_slime');
    expect(ids).toContain('dragon_kids');
  });

  it('親のランクが違う場合は両方のランクの表から選べる（F×G）', () => {
    const result = engine.candidates(m('slime_beth'), m('kodora'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id);
    // Gランク表の候補
    expect(ids).toContain('hane_slime');
    expect(ids).toContain('dragon_kids');
    // Fランク表の候補
    expect(ids).toContain('dragoslime');
    expect(ids).toContain('smile_lizard');
  });

  it('通常配合では親よりランクが上の子は生まれない', () => {
    const result = engine.candidates(m('slime'), m('kodora'), data);
    const orderOf = (rank: string) => data.ranks.find((r) => r.id === rank)!.order;
    const maxParent = Math.max(orderOf('G'), orderOf('G'));
    for (const c of result.filter((x) => x.method === 'normal')) {
      expect(orderOf(c.child.rank)).toBeLessThanOrEqual(maxParent);
    }
  });
});

describe('DQM3 特殊配合', () => {
  it('モンスター指定レシピが順不同で一致する', () => {
    const a = engine.candidates(m('slime_knight'), m('hoimi_slime'), data);
    const b = engine.candidates(m('hoimi_slime'), m('slime_knight'), data);
    expect(a.some((c) => c.method === 'special' && c.child.id === 'king_slime')).toBe(true);
    expect(b.some((c) => c.method === 'special' && c.child.id === 'king_slime')).toBe(true);
  });

  it('系統指定レシピが一致する（ドラゴン×自然系→スカイドラゴン）', () => {
    const result = engine.candidates(m('dragon_e'), m('momon'), data);
    expect(result.some((c) => c.method === 'special' && c.child.id === 'sky_dragon')).toBe(true);
  });

  it('条件を満たさないペアには特殊配合が出ない', () => {
    const result = engine.candidates(m('slime'), m('momonja'), data);
    expect(result.every((c) => c.method !== 'special')).toBe(true);
  });
});

describe('DQM3 逆算プランナー', () => {
  function leaves(plan: BreedingPlan): Monster[] {
    if (plan.kind === 'wild') return [plan.monster];
    return plan.parents.flatMap(leaves);
  }

  it('野生入手可能モンスターは葉として返る', () => {
    const plan = engine.plan('slime', data);
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('wild');
  });

  it('特殊配合1段の逆算ができる（キングスライム）', () => {
    const plan = engine.plan('king_slime', data);
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('breed');
    // 葉はすべて野生入手可能であること
    for (const leaf of leaves(plan!)) {
      expect(leaf.obtainable).toBe(true);
    }
  });

  it('多段の逆算ができ、葉がすべて野生入手可能（ダークドレアム）', () => {
    const plan = engine.plan('dark_dream', data);
    expect(plan).not.toBeNull();
    expect(plan!.cost).toBeGreaterThanOrEqual(5);
    for (const leaf of leaves(plan!)) {
      expect(leaf.obtainable).toBe(true);
    }
  });

  it('通常配合の逆算では子と同じ個体を親に使わない', () => {
    const plan = engine.plan('smile_lizard', data);
    expect(plan).not.toBeNull();
    if (plan!.kind === 'breed') {
      for (const p of plan!.parents) {
        expect(p.monster.id).not.toBe('smile_lizard');
      }
    }
  });
});
