// 「相方は他のモンスターでもよい」を条件文にまとめる処理の検証。
// 位階配合には上限が効くケースと下限が効くケースの両方があるので、
// 「以下」「以上」を取り違えないことを重点的に確かめる。
import { describe, expect, it } from 'vitest';
import { findParentAlternatives } from '@/lib/engine/alternatives';
import { tierRuleset } from '@/lib/engine/tier';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';
import type { Monster, TitleData } from '@/lib/engine/types';

// スライム系だけの単純なデータ。全部スカウトできるので「用意できない」除外は効かない
const monsters: Monster[] = [
  { id: 's1', name: 'スラ1', familyId: 'slime', rank: 'F', tier: 10, obtainable: true },
  { id: 's2', name: 'スラ2', familyId: 'slime', rank: 'F', tier: 20, obtainable: true },
  { id: 's3', name: 'スラ3', familyId: 'slime', rank: 'E', tier: 30, obtainable: true },
  { id: 's4', name: 'スラ4', familyId: 'slime', rank: 'E', tier: 40, obtainable: true },
  { id: 's5', name: 'スラ5', familyId: 'slime', rank: 'D', tier: 50, obtainable: true },
];

const data: TitleData = {
  id: 'test',
  name: 'テスト',
  ruleset: 'tier',
  ranks: ['F', 'E', 'D'].map((id, order) => ({ id, order })),
  families: [{ id: 'slime', name: 'スライム系' }],
  monsters,
  familyPairs: [{ familyA: 'slime', familyB: 'slime', childFamilyId: 'slime' }],
  specialRecipes: [],
};

describe('相方の条件文', () => {
  it('同系統配合では「強いほうの親の1つ上」なので相方は位階以下でよい', () => {
    // スラ4(40)を固定すると、位階40以下の相方ならどれでもスラ5(50)が生まれる
    // （スラ4同士でもよいのでスラ4自身も候補に入る）
    const alt = findParentAlternatives(tierRuleset, data, 's5', 's4');
    expect(alt.candidates.map((m) => m.id).sort()).toEqual(['s1', 's2', 's3', 's4']);
    // このデータは全部スライム系なので、系統を書いても絞り込みにならず省かれる
    expect(alt.summary).toBe('位階40以下のモンスター');
  });

  it('候補が1体しかないときは条件文にしない', () => {
    // スラ1(10)を固定すると、スラ5(50)を生むにはスラ4(40)しかない
    const alt = findParentAlternatives(tierRuleset, data, 's5', 's1');
    expect(alt.candidates.map((m) => m.id)).toEqual(['s4']);
    expect(alt.summary).toBeNull();
  });

  it('どうやっても用意できないモンスターは相方の候補から除く', () => {
    // スラ1をスカウト不可にすると、そこから積み上がる位階配合も成立しなくなる
    const shut: TitleData = {
      ...data,
      monsters: monsters.map((m) =>
        m.id === 's1' || m.id === 's2' ? { ...m, obtainable: false } : m,
      ),
    };
    const alt = findParentAlternatives(tierRuleset, shut, 's5', 's4');
    expect(alt.candidates.map((m) => m.id)).not.toContain('s1');
    expect(alt.candidates.map((m) => m.id)).not.toContain('s2');
  });

  it('実データでも「以下」と書いた条件が候補の範囲と一致する', { timeout: 60_000 }, () => {
    // 条件文が候補の実態とズレていないか（例: 下限が効くのに「以下」と書く）を全体で確認する
    for (const title of listTitles()) {
      if (title.ruleset !== 'tier') continue;
      const engine = getRuleset(title.ruleset);
      let checked = 0;
      for (const target of title.monsters) {
        if (checked >= 30) break;
        const plan = engine.plan(target.id, title);
        if (!plan || plan.kind !== 'breed' || plan.method !== 'normal') continue;
        checked += 1;
        for (const fixed of plan.parents) {
          const alt = findParentAlternatives(engine, title, target.id, fixed.monster.id);
          const { summary, candidates } = alt;
          if (!summary) continue;
          const tiers = candidates.map((m) => m.tier).filter((t): t is number => t !== undefined);
          const label = `${title.name} ${target.name} ← ${fixed.monster.name} × ${summary}`;

          const upper = summary.match(/位階(\d+)以下/);
          if (upper) {
            expect(Math.max(...tiers), label).toBe(Number(upper[1]));
          }
          const lower = summary.match(/位階(\d+)以上/);
          if (lower) {
            expect(Math.min(...tiers), label).toBe(Number(lower[1]));
          }
          const range = summary.match(/位階(\d+)〜(\d+)/);
          if (range) {
            expect(Math.min(...tiers), label).toBe(Number(range[1]));
            expect(Math.max(...tiers), label).toBe(Number(range[2]));
          }
          // 系統を書いたなら、候補は本当にその系統だけであること
          const families = new Set(candidates.map((m) => m.familyId));
          for (const family of title.families) {
            if (!summary.includes(family.name)) continue;
            expect(families.has(family.id), `${label}: ${family.name}が候補にない`).toBe(true);
          }
        }
      }
    }
  });
});
