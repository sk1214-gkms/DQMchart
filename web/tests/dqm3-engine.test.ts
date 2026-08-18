import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { getTitle } from '@/lib/titles';
import type { BreedingPlan, Monster } from '@/lib/engine/types';

const data = getTitle('dqm3');
const engine = getRuleset(data.ruleset);

function m(id: string): Monster {
  const found = data.monsters.find((x) => x.id === id);
  if (!found) throw new Error(`データにいないモンスター: ${id}`);
  return found;
}

const rankOrder = (rank: string) => data.ranks.find((r) => r.id === rank)!.order;

describe('マスタデータの整合性', () => {
  it('通常配合表の子がすべてモンスター一覧に存在する', () => {
    const ids = new Set(data.monsters.map((x) => x.id));
    for (const rule of data.normalRules) {
      for (const child of rule.childIds) expect(ids.has(child)).toBe(true);
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

  it('すべてのモンスターに入手手段がある（配合で作れるか、配合なしで入手できる）', () => {
    const childIds = new Set([
      ...data.normalRules.flatMap((r) => r.childIds),
      ...data.specialRecipes.map((r) => r.childId),
    ]);
    const orphans = data.monsters.filter((m) => !m.obtainable && !childIds.has(m.id));
    expect(orphans.map((m) => m.name)).toEqual([]);
  });

  it('配合なしで入手できるモンスターには入手手段の種別が付いている', () => {
    for (const m of data.monsters) {
      if (!m.obtainable) continue;
      expect(['wild', 'egg', 'event']).toContain(m.acquisition);
    }
  });

  it('通常配合表はG〜Bランクのみで、系統ペアごとに子が2体', () => {
    const ranks = new Set(data.normalRules.map((r) => r.rank));
    expect([...ranks].sort()).toEqual(['B', 'C', 'D', 'E', 'F', 'G']);
    for (const rule of data.normalRules) {
      expect(rule.childIds).toHaveLength(2);
      expect(rule.familyA).not.toBe(rule.familyB); // 同系統ペアは表に存在しない
    }
  });
});

describe('DQM3 通常配合', () => {
  it('同ランクの系統ペアから子候補が出る（スライム系G×ドラゴン系G）', () => {
    const result = engine.candidates(m('スライム'), m('コドラ'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id);
    expect(ids).toContain('はねスライム');
    expect(ids).toContain('ドラゴンキッズ');
  });

  it('親のランクが違う場合は両方のランクの表から選べる（F×G）', () => {
    const result = engine.candidates(m('スライムベス'), m('コドラ'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id);
    // Gランク表の候補
    expect(ids).toContain('はねスライム');
    expect(ids).toContain('ドラゴンキッズ');
    // Fランク表の候補
    expect(ids).toContain('ドラゴスライム');
    expect(ids).toContain('スマイルリザード');
  });

  it('親自身の種族も常に子候補に含まれる', () => {
    const result = engine.candidates(m('スライムベス'), m('コドラ'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id);
    expect(ids).toContain('スライムベス');
    expect(ids).toContain('コドラ');
  });

  it('同系統同士の配合では親のどちらかしか生まれない', () => {
    const result = engine.candidates(m('スライム'), m('スライムベス'), data);
    const ids = result.filter((c) => c.method === 'normal').map((c) => c.child.id).sort();
    expect(ids).toEqual(['スライム', 'スライムベス']);
  });

  it('通常配合では親よりランクが上の子は生まれない', () => {
    const result = engine.candidates(m('スライム'), m('コドラ'), data);
    const maxParent = Math.max(rankOrder(m('スライム').rank), rankOrder(m('コドラ').rank));
    for (const c of result.filter((x) => x.method === 'normal')) {
      expect(rankOrder(c.child.rank)).toBeLessThanOrEqual(maxParent);
    }
  });
});

describe('DQM3 特殊配合', () => {
  it('モンスター指定レシピが順不同で一致する', () => {
    const recipe = data.specialRecipes.find(
      (r) => r.parents.length === 2 && r.parents.every((p) => p.kind === 'monster'),
    )!;
    const [p1, p2] = recipe.parents.map((p) => m((p as { monsterId: string }).monsterId));
    const forward = engine.candidates(p1, p2, data);
    const reverse = engine.candidates(p2, p1, data);
    expect(forward.some((c) => c.method === 'special' && c.child.id === recipe.childId)).toBe(true);
    expect(reverse.some((c) => c.method === 'special' && c.child.id === recipe.childId)).toBe(true);
  });

  it('系統指定レシピが一致する（スライム×魔獣系→ぶちスライム）', () => {
    const beast = data.monsters.find((x) => x.familyId === 'beast')!;
    const result = engine.candidates(m('スライム'), beast, data);
    expect(result.some((c) => c.method === 'special' && c.child.id === 'ぶちスライム')).toBe(true);
  });

  it('特殊配合の子はほぼ上位親と同ランクか1つ上に収まる（メタル系など少数の例外を許容）', () => {
    let checked = 0;
    const exceptions: string[] = [];
    for (const recipe of data.specialRecipes) {
      if (recipe.parents.length !== 2) continue;
      const parents = recipe.parents.flatMap((p) =>
        p.kind === 'monster' ? [m(p.monsterId)] : [],
      );
      if (parents.length !== 2) continue; // 系統指定は親ランクが定まらないので対象外
      checked += 1;
      const maxParent = Math.max(...parents.map((p) => rankOrder(p.rank)));
      if (rankOrder(m(recipe.childId).rank) > maxParent + 1) exceptions.push(recipe.childId);
    }
    expect(checked).toBeGreaterThan(100);
    // 大きく外れるものが増えたらデータ取り込みの誤りを疑う
    expect(exceptions.length / checked).toBeLessThan(0.05);
  });

  it('ランクアップ（親より上のランク）は特殊配合でのみ起こる', () => {
    const gainsRank = data.specialRecipes.some((recipe) => {
      const parents = recipe.parents.flatMap((p) => (p.kind === 'monster' ? [m(p.monsterId)] : []));
      if (parents.length === 0) return false;
      const maxParent = Math.max(...parents.map((p) => rankOrder(p.rank)));
      return rankOrder(m(recipe.childId).rank) > maxParent;
    });
    expect(gainsRank).toBe(true);
    // 通常配合表側は親ランクを超えないことを全件確認
    for (const rule of data.normalRules) {
      for (const childId of rule.childIds) {
        expect(rankOrder(m(childId).rank)).toBeLessThanOrEqual(rankOrder(rule.rank));
      }
    }
  });
});

describe('DQM3 逆算プランナー', () => {
  function leaves(plan: BreedingPlan): Monster[] {
    if (plan.kind === 'wild') return [plan.monster];
    return plan.parents.flatMap(leaves);
  }

  it('野生入手可能モンスターは葉として返る', () => {
    const wild = data.monsters.find((x) => x.obtainable)!;
    const plan = engine.plan(wild.id, data);
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('wild');
  });

  it('特殊配合が必要なモンスターを逆算でき、葉がすべて野生入手可能', () => {
    const target = data.specialRecipes.find((r) => {
      const child = data.monsters.find((x) => x.id === r.childId);
      return child && !child.obtainable && engine.plan(child.id, data) !== null;
    })!;
    const plan = engine.plan(target.childId, data);
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('breed');
    for (const leaf of leaves(plan!)) {
      expect(leaf.obtainable).toBe(true);
    }
  });

  it('4体配合を経由するプランを組み立てられる', () => {
    const quadRecipes = data.specialRecipes.filter((r) => r.parents.length === 4);
    expect(quadRecipes.length).toBeGreaterThan(0);
    const reachableQuad = quadRecipes.filter((r) => {
      const plan = engine.plan(r.childId, data);
      return plan?.kind === 'breed' && plan.method === 'quad';
    });
    expect(reachableQuad.length).toBeGreaterThan(0);
    const plan = engine.plan(reachableQuad[0].childId, data);
    expect(plan!.kind).toBe('breed');
    if (plan!.kind === 'breed') {
      expect(plan!.parents).toHaveLength(4);
      // 4体配合は中間2回＋最終1回の3手が最低必要
      expect(plan!.cost).toBeGreaterThanOrEqual(3);
    }
    for (const leaf of leaves(plan!)) expect(leaf.obtainable).toBe(true);
  });

  it('逆算結果の各配合ステップが配合ルール上も成立する', () => {
    const verify = (p: BreedingPlan): void => {
      if (p.kind === 'wild') return;
      if (p.method === 'quad') {
        expect(p.parents).toHaveLength(4);
        const ok = engine
          .quadCandidates(
            p.parents.map((x) => x.monster),
            data,
          )
          .some((c) => c.child.id === p.monster.id);
        expect(ok).toBe(true);
      } else if (p.parents.length === 2) {
        const ok = engine
          .candidates(p.parents[0].monster, p.parents[1].monster, data)
          .some((c) => c.child.id === p.monster.id);
        expect(ok).toBe(true);
      }
      p.parents.forEach(verify);
    };
    // 到達可能なモンスターを幅広く検証する
    for (const m of data.monsters) {
      const plan = engine.plan(m.id, data);
      if (plan) verify(plan);
    }
  });

  it('直接入手できるモンスターでも配合ルートを取得できる', () => {
    // 野生入手できるうえに配合でも作れるモンスターを探す
    const target = data.monsters.find(
      (m) => m.obtainable && engine.planByBreeding(m.id, data) !== null,
    );
    expect(target).toBeDefined();

    // 通常のplanは直接入手（葉）を返す
    expect(engine.plan(target!.id, data)!.kind).toBe('wild');

    // planByBreedingは配合で作る手順を返す
    const byBreeding = engine.planByBreeding(target!.id, data)!;
    expect(byBreeding.kind).toBe('breed');
    expect(byBreeding.cost).toBeGreaterThanOrEqual(1);
    if (byBreeding.kind === 'breed' && byBreeding.parents.length === 2) {
      const ok = engine
        .candidates(byBreeding.parents[0].monster, byBreeding.parents[1].monster, data)
        .some((c) => c.child.id === target!.id);
      expect(ok).toBe(true);
    }
  });

  it('配合で作れないモンスターはplanByBreedingがnullを返す', () => {
    const childIds = new Set([
      ...data.normalRules.flatMap((r) => r.childIds),
      ...data.specialRecipes.map((r) => r.childId),
    ]);
    const onlyDirect = data.monsters.find((m) => !childIds.has(m.id));
    if (onlyDirect) expect(engine.planByBreeding(onlyDirect.id, data)).toBeNull();
  });

  it('すべてのモンスターに到達ルートがある', () => {
    const unreachable = data.monsters.filter((x) => engine.plan(x.id, data) === null);
    expect(unreachable.map((m) => m.name)).toEqual([]);
  });
});
