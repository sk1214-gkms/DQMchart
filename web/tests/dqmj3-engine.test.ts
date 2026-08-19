// ジョーカー3方式の配合エンジン検証。計算式が仕様どおりかを小さなデータで確かめる。
import { describe, expect, it } from 'vitest';
import { dqmj3Ruleset, childTiers } from '@/lib/engine/dqmj3';
import type { Monster, TitleData } from '@/lib/engine/types';

// 位階1〜40の検証用モンスター（名前は位階番号そのまま）
const monsters: Monster[] = Array.from({ length: 40 }, (_, i) => ({
  id: `M${i + 1}`,
  name: `M${i + 1}`,
  familyId: i % 2 === 0 ? 'slime' : 'dragon',
  rank: 'F',
  tier: i + 1,
  // 下位のいくつかは入手できるものとして扱う
  ...(i < 30 ? { obtainable: true, acquisition: 'wild' as const } : {}),
}));

const data: TitleData = {
  id: 'test',
  name: 'テスト',
  ruleset: 'dqmj3',
  ranks: [{ id: 'F', order: 0 }],
  families: [
    { id: 'slime', name: 'スライム系' },
    { id: 'dragon', name: 'ドラゴン系' },
  ],
  monsters,
  specialRecipes: [],
};

const m = (tier: number) => monsters.find((x) => x.tier === tier)!;

describe('ジョーカー3の位階計算', () => {
  it('攻略サイトの実例を再現できる（位階18×27の1番目は35）', () => {
    // 1の位は 8+7=15 で10以上 → 27 + 8 = 35
    expect(childTiers(27, 18)[0]).toBe(35);
  });

  it('1の位の合計が10以上のときの計算式', () => {
    // A=27, B=18 → 候補2 = 18 + 7 - 5 = 20、候補3 = (27+18)/2 = 22
    const [c1, c2, c3] = childTiers(27, 18);
    expect(c1).toBe(35);
    expect(c2).toBe(20);
    expect(c3).toBe(22);
  });

  it('1の位の合計が10未満のときの計算式', () => {
    // A=22, B=13 → 1の位 2+3=5 で10未満
    // 候補1 = 22 + 3 + 10 = 35、候補2 = 13 + 2 + 5 = 20、候補3 = (22+13)/2 = 17
    const [c1, c2, c3] = childTiers(22, 13);
    expect(c1).toBe(35);
    expect(c2).toBe(20);
    expect(c3).toBe(17);
  });

  it('親の順序を入れ替えても結果は同じ', () => {
    expect(childTiers(18, 27)).toEqual(childTiers(27, 18));
  });
});

describe('ジョーカー3の子候補', () => {
  it('計算結果の位階のモンスターと親自身が候補になる', () => {
    const ids = dqmj3Ruleset
      .candidates(m(27), m(18), data)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.tier);
    expect(ids).toContain(35);
    expect(ids).toContain(20);
    expect(ids).toContain(22);
    expect(ids).toContain(27); // 親A
    expect(ids).toContain(18); // 親B
  });

  it('一般配合で作れない位階なら1つ下のモンスターになる', () => {
    const excluded: TitleData = {
      ...data,
      monsters: monsters.map((x) => (x.tier === 35 ? { ...x, tierExcluded: true } : x)),
    };
    const tiers = dqmj3Ruleset
      .candidates(m(27), m(18), excluded)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.tier);
    expect(tiers).not.toContain(35);
    expect(tiers).toContain(34);
  });
});

describe('ジョーカー3の逆算', () => {
  it('入手できるモンスターは葉として返る', () => {
    expect(dqmj3Ruleset.plan('M5', data)?.kind).toBe('wild');
  });

  it('配合が必要なモンスターを逆算でき、実際にその子が生まれる', () => {
    let checked = 0;
    for (const target of monsters) {
      const plan = dqmj3Ruleset.plan(target.id, data);
      if (!plan || plan.kind !== 'breed' || plan.method !== 'normal') continue;
      const ok = dqmj3Ruleset
        .candidates(plan.parents[0].monster, plan.parents[1].monster, data)
        .some((c) => c.child.id === target.id);
      expect(ok).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('入手できない上位モンスターにも到達できる', () => {
    // 位階31以上は直接入手できないが、配合で作れるはず
    const reachable = monsters
      .filter((x) => (x.tier ?? 0) > 30)
      .filter((x) => dqmj3Ruleset.plan(x.id, data) !== null);
    expect(reachable.length).toBeGreaterThan(0);
  });
});
