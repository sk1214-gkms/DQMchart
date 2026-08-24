// 素材として「何体も用意できないモンスター」を大量に要求していないか確かめる。
//
// 配合は親を消費するので、イベントで1体しかもらえないモンスターを
// 相方に選び続けると実行できない手順になる。
// （イルルカSPのモントナーは位階1で全モンスターの相方になれるため、
//  以前は31体必要という手順が出ていた）
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';
import { repeatable } from '@/lib/engine/supply';
import type { BreedingPlan } from '@/lib/engine/types';

/** 手順の中で各モンスターが何体必要か数える */
function countLeaves(plan: BreedingPlan): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (p: BreedingPlan) => {
    if (p.kind !== 'breed') {
      out.set(p.monster.id, (out.get(p.monster.id) ?? 0) + 1);
      return;
    }
    p.parents.forEach(walk);
  };
  walk(plan);
  return out;
}

describe('素材の集めやすさ', () => {
  const report: string[] = [];

  for (const data of listTitles()) {
    it(`${data.name}: 1体しか手に入らないモンスターを大量に要求しない`, { timeout: 120_000 }, () => {
      const engine = getRuleset(data.ruleset);
      const byId = new Map(data.monsters.map((m) => [m.id, m]));
      const worst = new Map<string, number>();
      for (const m of data.monsters) {
        const plan = engine.plan(m.id, data);
        if (!plan) continue;
        for (const [id, n] of countLeaves(plan)) {
          const src = byId.get(id);
          if (!src || repeatable(src, engine, data)) continue;
          if ((worst.get(id) ?? 0) < n) worst.set(id, n);
        }
      }
      for (const [id, n] of [...worst.entries()].sort((a, b) => b[1] - a[1])) {
        report.push(`${data.name}: ${id} が最大${n}体必要`);
      }
      // 1体しか手に入らないモンスターを何十体も要求するのは明らかにおかしい。
      // 数体で済む範囲なら、配合レシピ自体がそれを要求している場合がある
      const tooMany = [...worst.entries()].filter(([, n]) => n > 8);
      expect(tooMany.map(([id, n]) => `${id}×${n}`)).toEqual([]);
    });
  }

  it('1体しか手に入らないのに複数必要なものを把握しておく', () => {
    // レシピ自体が同じモンスターを複数要求している場合があるので落としはしない。
    // ただし数が急に増えたら選び方が壊れたサインなので見ておく。
    if (report.length) console.log(report.join('\n'));
    expect(report.length).toBeLessThan(200);
  });
});
