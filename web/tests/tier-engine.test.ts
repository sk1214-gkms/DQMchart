// 位階配合エンジンの検証。仕様どおりに子が決まるかを小さなデータで確かめる。
import { describe, expect, it } from 'vitest';
import { tierRuleset } from '@/lib/engine/tier';
import type { Monster, TitleData } from '@/lib/engine/types';

// 系統ごとに位階順のモンスターを並べた検証用データ
// （位階は全系統を通した順序。スライム系: 10,30,60 / ドラゴン系: 20,50,80 ...）
const monsters: Monster[] = [
  { id: 'スラA', name: 'スラA', familyId: 'slime', rank: 'F', tier: 10, obtainable: true },
  { id: 'ドラA', name: 'ドラA', familyId: 'dragon', rank: 'F', tier: 20, obtainable: true },
  { id: 'スラB', name: 'スラB', familyId: 'slime', rank: 'E', tier: 30 },
  { id: 'ぶつA', name: 'ぶつA', familyId: 'material', rank: 'E', tier: 40, obtainable: true },
  { id: 'ドラB', name: 'ドラB', familyId: 'dragon', rank: 'D', tier: 50 },
  { id: 'スラC', name: 'スラC', familyId: 'slime', rank: 'C', tier: 60 },
  { id: 'ぶつB', name: 'ぶつB', familyId: 'material', rank: 'C', tier: 70 },
  { id: 'ドラC', name: 'ドラC', familyId: 'dragon', rank: 'B', tier: 80 },
];

const data: TitleData = {
  id: 'test',
  name: 'テスト',
  ruleset: 'tier',
  ranks: ['F', 'E', 'D', 'C', 'B'].map((id, order) => ({ id, order })),
  families: [
    { id: 'slime', name: 'スライム系' },
    { id: 'dragon', name: 'ドラゴン系' },
    { id: 'material', name: 'ぶっしつ系' },
  ],
  monsters,
  familyPairs: [
    { familyA: 'slime', familyB: 'dragon', childFamilyId: 'material' },
    { familyA: 'slime', familyB: 'slime', childFamilyId: 'slime' },
    { familyA: 'dragon', familyB: 'dragon', childFamilyId: 'dragon' },
    { familyA: 'material', familyB: 'material', childFamilyId: 'material' },
    { familyA: 'slime', familyB: 'material', childFamilyId: 'dragon' },
    { familyA: 'dragon', familyB: 'material', childFamilyId: 'slime' },
  ],
  specialRecipes: [
    {
      id: 'sp1',
      childId: 'ドラC',
      parents: [
        { kind: 'monster', monsterId: 'スラC' },
        { kind: 'monster', monsterId: 'ぶつB' },
      ],
    },
  ],
};

const m = (id: string) => monsters.find((x) => x.id === id)!;
const childIds = (a: string, b: string) =>
  tierRuleset
    .candidates(m(a), m(b), data)
    .filter((c) => c.method === 'normal')
    .map((c) => c.child.id);

describe('位階配合', () => {
  it('異系統配合では3種類＋親自身が候補になる', () => {
    // スラA(10) × ドラA(20)。強い親=ドラA(20)、弱い親=スラA(10)
    const ids = childIds('スラA', 'ドラA');
    // 候補1: スライム系で20より上 → スラB(30)
    expect(ids).toContain('スラB');
    // 候補2: ドラゴン系で20より上 → ドラB(50)
    expect(ids).toContain('ドラB');
    // 候補3: 系統表[slime,dragon]=material で、弱い親(10)より上 → ぶつA(40)
    expect(ids).toContain('ぶつA');
    // 親自身も残る
    expect(ids).toContain('スラA');
    expect(ids).toContain('ドラA');
  });

  it('同系統配合では強い親の1つ上だけが候補になる', () => {
    // スラA(10) × スラB(30) → スライム系で30より上 → スラC(60)
    const ids = childIds('スラA', 'スラB');
    expect(ids).toContain('スラC');
    expect(ids).not.toContain('ぶつA');
    expect(ids).not.toContain('ドラB');
  });

  it('系統の最上位からはそれ以上の子が生まれない（位階の打ち止め）', () => {
    // ドラC(80)はドラゴン系の最上位。同系統配合しても上がない
    const ids = childIds('ドラB', 'ドラC');
    expect(ids.filter((id) => id !== 'ドラB' && id !== 'ドラC')).toEqual([]);
  });

  it('候補は強い親の位階を基準にする（弱い親を変えても候補1・2は同じ）', () => {
    const withWeak = childIds('スラA', 'ドラB'); // 強い=ドラB(50)
    const withStrong = childIds('スラB', 'ドラB'); // 強い=ドラB(50)
    expect(withWeak).toContain('スラC'); // スライム系で50より上
    expect(withStrong).toContain('スラC');
  });

  it('特殊配合は位階に関係なく成立する', () => {
    const result = tierRuleset.candidates(m('スラC'), m('ぶつB'), data);
    expect(result.some((c) => c.method === 'special' && c.child.id === 'ドラC')).toBe(true);
  });

  it('位階配合対象外のモンスターは飛ばして次の位階が選ばれる', () => {
    // スラB(30)を対象外にすると、スラA×ドラA の候補1はスラC(60)になる
    const excluded: TitleData = {
      ...data,
      monsters: data.monsters.map((x) =>
        x.id === 'スラB' ? { ...x, tierExcluded: true } : x,
      ),
    };
    const ids = tierRuleset
      .candidates(m('スラA'), m('ドラA'), excluded)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    expect(ids).not.toContain('スラB');
    expect(ids).toContain('スラC');
  });

  it('位階配合対象外のモンスターは位階配合では逆算されない', () => {
    const excluded: TitleData = {
      ...data,
      monsters: data.monsters.map((x) =>
        x.id === 'スラB' ? { ...x, tierExcluded: true } : x,
      ),
    };
    const plan = tierRuleset.plan('スラB', excluded);
    // 特殊配合も無いので作れない
    expect(plan).toBeNull();
  });
});

describe('位階配合の逆算', () => {
  it('入手できるモンスターは葉になる', () => {
    const plan = tierRuleset.plan('スラA', data);
    expect(plan?.kind).toBe('wild');
  });

  it('配合が必要なモンスターの手順を逆算でき、葉が入手可能なものだけになる', () => {
    const plan = tierRuleset.plan('スラB', data);
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('breed');

    const leaves = (p: typeof plan): Monster[] =>
      !p ? [] : p.kind === 'wild' ? [p.monster] : p.parents.flatMap(leaves);
    for (const leaf of leaves(plan)) expect(leaf.obtainable).toBe(true);
  });

  it('逆算した配合が実際にその子を生むことを検算できる', () => {
    for (const target of monsters) {
      const plan = tierRuleset.plan(target.id, data);
      if (!plan || plan.kind !== 'breed' || plan.parents.length !== 2) continue;
      const ok = tierRuleset
        .candidates(plan.parents[0].monster, plan.parents[1].monster, data)
        .some((c) => c.child.id === target.id);
      expect(ok).toBe(true);
    }
  });
});

// ジョーカー1のように位階表が途中で打ち切られている作品では、
// 表より上のモンスターの位階が公開されていない。
// 最弱として扱ってしまうと、上位モンスターを弱い親にした嘘の配合が出るので、
// 「表のどれよりも上」として扱えているかを確かめる。
describe('位階が分かっていないモンスター', () => {
  const withUnknown: TitleData = {
    ...data,
    id: 'unknown-tier',
    monsters: [
      ...monsters,
      // 位階表に載っていない上位モンスター（位階配合では生まれない）
      { id: '強スラ', name: '強スラ', familyId: 'slime', rank: 'B', obtainable: true, tierExcluded: true },
    ],
  };
  const pick = (id: string) => withUnknown.monsters.find((x) => x.id === id)!;

  it('位階の分からない親は最強として扱われ、位階配合の子が出ない', () => {
    const ids = tierRuleset
      .candidates(pick('強スラ'), pick('スラA'), withUnknown)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    // 親自身の種族だけが残る（スラAより上のスライムは生まれない）
    expect(ids.sort()).toEqual(['スラA', '強スラ']);
  });

  it('位階の分からない親同士でも位階配合の子は出ない', () => {
    const ids = tierRuleset
      .candidates(pick('強スラ'), pick('強スラ'), withUnknown)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    expect(ids).toEqual(['強スラ']);
  });

  it('位階が分かっている組み合わせは今までどおり', () => {
    const ids = tierRuleset
      .candidates(pick('スラA'), pick('スラB'), withUnknown)
      .filter((c) => c.method === 'normal')
      .map((c) => c.child.id);
    expect(ids).toContain('スラC');
  });
});
