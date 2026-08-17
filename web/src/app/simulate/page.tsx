'use client';
// 配合シミュレータ: 親2体 → 子候補（通常配合＋特殊配合）
import { useMemo, useState } from 'react';
import { MonsterPicker } from '@/components/MonsterPicker';
import {
  FamilyMark,
  RankText,
  familyBackground,
  familyColor,
  familyName,
} from '@/components/MonsterBadges';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';

export default function SimulatePage() {
  const data = useTitleData();
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');

  const results = useMemo(() => {
    const a = data.monsters.find((m) => m.id === aId);
    const b = data.monsters.find((m) => m.id === bId);
    if (!a || !b) return null;
    return getRuleset(data.ruleset).candidates(a, b, data);
  }, [data, aId, bId]);

  // 選んだ2体が祖父母に含まれる4体配合を参考表示（4体配合の判定には祖父母4体が必要）
  const quadHints = useMemo(() => {
    if (!aId || !bId) return [];
    const monsterName = (id: string) => data.monsters.find((m) => m.id === id)?.name ?? id;
    const familyLabel = (id: string) => data.families.find((f) => f.id === id)?.name ?? id;
    return data.specialRecipes
      .filter(
        (r) =>
          r.parents.length === 4 &&
          [aId, bId].every((id) =>
            r.parents.some((p) => p.kind === 'monster' && p.monsterId === id),
          ),
      )
      .map((r) => ({
        recipeId: r.id,
        childName: monsterName(r.childId),
        parentNames: r.parents.map((p) =>
          p.kind === 'monster' ? monsterName(p.monsterId) : familyLabel(p.familyId),
        ),
      }));
  }, [data, aId, bId]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">配合シミュレータ</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <MonsterPicker data={data} value={aId} onChange={setAId} label="親①" />
        <MonsterPicker data={data} value={bId} onChange={setBId} label="親②" />
      </div>
      {aId && bId && (
        <button
          onClick={() => {
            setAId(bId);
            setBId(aId);
          }}
          className="btn btn-outline self-start text-sm"
        >
          親①と親②を入れ替える
        </button>
      )}

      {quadHints.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">この2体が祖父母に含まれる4体配合があります</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {quadHints.map((h) => (
              <li key={h.recipeId}>
                {h.childName} ← {h.parentNames.join(' ＋ ')}（この4体を祖父母にして2回配合し、その子同士を配合）
              </li>
            ))}
          </ul>
        </section>
      )}

      {results === null ? (
        <p className="text-sm text-[var(--muted)]">親を2体選ぶと子候補を表示します。</p>
      ) : results.length === 0 ? (
        <p className="card text-sm text-[var(--muted)]">
          この組み合わせから生まれる子はデータに登録されていません。
        </p>
      ) : (
        <section>
          <h2 className="mb-2 font-bold">
            生まれる子候補
            <span className="ml-2 text-sm font-normal text-[var(--muted)]">{results.length}件</span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((c, i) => (
              <li
                key={`${c.child.id}-${c.method}-${i}`}
                className="flex items-center gap-2.5 rounded-lg border p-2.5 shadow-sm transition hover:shadow"
                style={{
                  background: familyBackground(c.child.familyId),
                  borderColor: familyColor(c.child.familyId),
                }}
              >
                <FamilyMark familyId={c.child.familyId} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.child.name}</div>
                  <div className="flex items-center gap-1.5">
                    <RankText rank={c.child.rank} />
                    <span className="truncate text-xs text-[var(--muted)]">
                      {familyName(data, c.child.familyId)}
                    </span>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
                    c.method === 'special'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-white/70 text-[var(--muted)]'
                  }`}
                >
                  {c.method === 'special' ? '特殊' : '通常'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
