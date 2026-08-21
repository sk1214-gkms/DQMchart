import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';
import type { BreedingPlan } from '@/lib/engine/types';

// 高速化のあとでも、出てくる手順が「本当に成立する配合」であることを確かめる。
// 手順の中身は最短が複数あれば変わりうるので、手数と整合性を見る。
describe('逆算した手順の妥当性', () => {
  for (const data of listTitles()) {
    it(`${data.name}: すべての手順が実際の配合判定と一致する`, { timeout: 300_000 }, () => {
      const engine = getRuleset(data.ruleset);
      const bad: string[] = [];
      let checked = 0;

      const verify = (p: BreedingPlan) => {
        if (p.kind !== 'breed') return;
        checked += 1;
        if (p.method === 'normal') {
          if (p.parents.length !== 2) bad.push(`${p.monster.name}: 通常配合なのに親${p.parents.length}体`);
          else {
            const [a, b] = p.parents.map((x) => x.monster);
            const ok = engine
              .candidates(a, b, data)
              .some((c) => c.child.id === p.monster.id && c.method === 'normal');
            if (!ok) bad.push(`${a.name} × ${b.name} では ${p.monster.name} は生まれない`);
          }
        }
        // 手数の整合（1 + 親の手数の合計、4体配合は3手）
        const own = p.method === 'quad' ? 3 : 1;
        const sum = own + p.parents.reduce((s, x) => s + x.cost, 0);
        if (sum !== p.cost) bad.push(`${p.monster.name}: 手数が合わない ${p.cost} ≠ ${sum}`);
        p.parents.forEach(verify);
      };

      for (const m of data.monsters) {
        const plan = engine.plan(m.id, data);
        if (plan) verify(plan);
      }
      expect(checked, '検証したステップが1つも無い').toBeGreaterThan(0);
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});
