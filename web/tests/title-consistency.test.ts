// 全タイトルのマスタデータが壊れていないかを確かめる。
// 作品を足したときに、名前の解決漏れや位階の抜けをここで拾う。
import { describe, expect, it } from 'vitest';
import { listTitles } from '@/lib/titles';

describe('マスタデータの整合', () => {
  for (const data of listTitles()) {
    describe(data.name, () => {
      const monsterIds = new Set(data.monsters.map((m) => m.id));
      const rankIds = new Set(data.ranks.map((r) => r.id));
      const familyIds = new Set(data.families.map((f) => f.id));

      it('モンスターのランクと系統が定義されている', () => {
        const bad = data.monsters.filter(
          (m) => !rankIds.has(m.rank) || !familyIds.has(m.familyId),
        );
        expect(bad.map((m) => `${m.name}(${m.rank}/${m.familyId})`)).toEqual([]);
      });

      it('モンスターのIDが重複していない', () => {
        expect(monsterIds.size).toBe(data.monsters.length);
      });

      it('レシピの子と親がすべて実在する', () => {
        const missing: string[] = [];
        for (const r of data.specialRecipes) {
          if (!monsterIds.has(r.childId)) missing.push(`${r.id}: 子 ${r.childId}`);
          for (const p of r.parents) {
            if (p.kind === 'monster' && !monsterIds.has(p.monsterId)) {
              missing.push(`${r.id}: 親 ${p.monsterId}`);
            }
            if (p.kind === 'family' && !familyIds.has(p.familyId)) {
              missing.push(`${r.id}: 系統 ${p.familyId}`);
            }
            if (p.kind === 'family' && p.minRankId && !rankIds.has(p.minRankId)) {
              missing.push(`${r.id}: ランク下限 ${p.minRankId}`);
            }
            if (p.kind === 'family' && p.maxRankId && !rankIds.has(p.maxRankId)) {
              missing.push(`${r.id}: ランク上限 ${p.maxRankId}`);
            }
          }
        }
        expect(missing).toEqual([]);
      });

      it('レシピの親は2体か4体', () => {
        const bad = data.specialRecipes.filter(
          (r) => r.parents.length !== 2 && r.parents.length !== 4,
        );
        expect(bad.map((r) => `${r.id}(${r.parents.length}体)`)).toEqual([]);
      });

      it('レシピIDが重複していない', () => {
        const ids = data.specialRecipes.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      if (data.ruleset === 'tier') {
        it('位階が無いモンスターは位階配合の対象外になっている', () => {
          // 位階表が途中までしか公開されていない作品があるが、
          // その分は必ず位階配合では生まれない扱いになっているはず
          const bad = data.monsters.filter((m) => m.tier === undefined && !m.tierExcluded);
          expect(bad.map((m) => m.name)).toEqual([]);
        });

        it('位階が重複していない', () => {
          const byTier = new Map<number, string[]>();
          for (const m of data.monsters) {
            if (m.tier === undefined) continue;
            const list = byTier.get(m.tier);
            if (list) list.push(m.name);
            else byTier.set(m.tier, [m.name]);
          }
          const dups = [...byTier.entries()].filter(([, v]) => v.length > 1);
          expect(dups.map(([t, v]) => `位階${t}: ${v.join('・')}`)).toEqual([]);
        });

        it('系統の掛け合わせ表が全ての組み合わせを網羅している', () => {
          const have = new Set(
            (data.familyPairs ?? []).map((p) => [p.familyA, p.familyB].sort().join('|')),
          );
          const missing: string[] = [];
          const ids = [...familyIds];
          for (let i = 0; i < ids.length; i++) {
            for (let j = i; j < ids.length; j++) {
              const key = [ids[i], ids[j]].sort().join('|');
              // ？？？系（神獣系）は位階配合で生まれないので組み合わせ表に無くてよい
              if (ids[i] === 'unknown' || ids[j] === 'unknown') continue;
              if (!have.has(key)) missing.push(key);
            }
          }
          expect(missing).toEqual([]);
        });
      }
    });
  }
});

// 作品間の引っ越し経路が壊れていないかを確かめる。
describe('引っ越し経路', () => {
  const ids = new Set(listTitles().map((t) => t.id));

  for (const data of listTitles()) {
    for (const rule of data.transfersFrom ?? []) {
      it(`${data.name} ← ${rule.titleId} の経路が有効`, () => {
        expect(ids.has(rule.titleId), `${rule.titleId} というタイトルが無い`).toBe(true);
        expect(rule.titleId).not.toBe(data.id); // 自分自身からは連れてこられない
        expect(rule.note.length).toBeGreaterThan(0);
        if (rule.maxRankId !== undefined) {
          expect(data.ranks.some((r) => r.id === rule.maxRankId)).toBe(true);
        }
      });
    }
  }

  it('他作品から連れてくるモンスターは、連れてくる元にも居る', () => {
    const byId = new Map(listTitles().map((t) => [t.id, t]));
    const problems: string[] = [];
    for (const data of listTitles()) {
      const sources = (data.transfersFrom ?? [])
        .map((r) => byId.get(r.titleId))
        .filter((t): t is NonNullable<typeof t> => t !== undefined);
      for (const m of data.monsters) {
        if (m.acquisition !== 'transfer') continue;
        if (!sources.some((s) => s.monsters.some((x) => x.id === m.id))) {
          problems.push(`${data.name} の ${m.name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
