// 「作り方」「使い道」の引き方を確かめる。
// 配合チャート（逆算）と違い1回の配合だけを見るので、
// エンジンの判定と食い違わないことが大事。
import { describe, expect, it } from 'vitest';
import { getRuleset } from '@/lib/engine/registry';
import { listTitles } from '@/lib/titles';
import { howToMake, usedFor } from '@/lib/engine/lookup';

describe('モンスター1体の作り方と使い道', () => {
  for (const data of listTitles()) {
    const engine = getRuleset(data.ruleset);

    it(`${data.name}: 特殊配合はデータの件数と一致する`, () => {
      const bad: string[] = [];
      for (const m of data.monsters.slice(0, 60)) {
        const how = howToMake(engine, data, m.id);
        const expected = data.specialRecipes.filter((r) => r.childId === m.id).length;
        if (how?.special.length !== expected) bad.push(`${m.name}: ${how?.special.length} ≠ ${expected}`);
      }
      expect(bad).toEqual([]);
    });

    it(`${data.name}: 出した親の組み合わせで実際にその子が生まれる`, () => {
      const bad: string[] = [];
      let checked = 0;
      for (const m of data.monsters.slice(0, 40)) {
        const how = howToMake(engine, data, m.id);
        for (const g of (how?.pairs ?? []).slice(0, 3)) {
          for (const p of g.partners.slice(0, 3)) {
            checked += 1;
            const ok = engine
              .candidates(g.basis, p, data)
              .some((c) => c.child.id === m.id && c.method === 'normal');
            if (!ok) bad.push(`${g.basis.name} × ${p.name} では ${m.name} は生まれない`);
          }
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
      // 全方式で組み合わせを出せること（出せない方式があると主機能が使えない）
      expect(checked, '親の組み合わせを1つも出せていない').toBeGreaterThan(0);
    });

    it(`${data.name}: 使い道に挙げた配合が実際に成立する`, () => {
      const bad: string[] = [];
      for (const m of data.monsters.slice(0, 20)) {
        for (const u of usedFor(engine, data, m.id).filter((x) => x.method === 'normal').slice(0, 5)) {
          for (const p of u.partners.slice(0, 2)) {
            const ok = engine
              .candidates(m, p, data)
              .some((c) => c.child.id === u.child.id && c.method === 'normal');
            if (!ok) bad.push(`${m.name} × ${p.name} では ${u.child.name} は生まれない`);
          }
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
  }
});
