'use client';
// モンスター選択UI: 名前・系統・ランクで絞り込み → セレクトで選ぶ
import { useMemo, useState } from 'react';
import { FamilyIcon } from '@/components/FamilyIcon';
import { acquisitionLabel, familyColor } from '@/components/MonsterBadges';
import type { TitleData } from '@/lib/engine/types';

export function monsterLabel(data: TitleData, monsterId: string): string {
  const m = data.monsters.find((x) => x.id === monsterId);
  if (!m) return monsterId;
  const fam = data.families.find((f) => f.id === m.familyId)?.name ?? m.familyId;
  return `${m.name}（${m.rank}・${fam}）`;
}

/** 集合の要素をトグルする（選択済みなら外す） */
function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function MonsterPicker({
  data,
  value,
  onChange,
  label,
}: {
  data: TitleData;
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [filter, setFilter] = useState('');
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [ranks, setRanks] = useState<Set<string>>(new Set());

  const activeCount = families.size + ranks.size + (filter ? 1 : 0);

  // 絞り込み結果。選択中のモンスターは条件から外れても残す（選択が消えないように）
  const matched = useMemo(
    () =>
      data.monsters.filter((m) => {
        if (filter && !m.name.includes(filter)) return false;
        if (families.size > 0 && !families.has(m.familyId)) return false;
        if (ranks.size > 0 && !ranks.has(m.rank)) return false;
        return true;
      }),
    [data, filter, families, ranks],
  );

  const grouped = useMemo(() => {
    const ids = new Set(matched.map((m) => m.id));
    const list = data.monsters.filter((m) => ids.has(m.id) || m.id === value);
    return data.families
      .map((f) => ({ family: f, monsters: list.filter((m) => m.familyId === f.id) }))
      .filter((g) => g.monsters.length > 0);
  }, [data, matched, value]);

  const clear = () => {
    setFilter('');
    setFamilies(new Set());
    setRanks(new Set());
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-[var(--foreground)]">{label}</span>

      <input
        className="field"
        type="search"
        placeholder="名前で絞り込み"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <details className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-[var(--muted)]">
          系統・ランクで絞り込む
          {activeCount > 0 && (
            <span className="ml-2 rounded bg-[var(--brand-500)] px-1.5 text-xs font-bold text-white">
              {activeCount}
            </span>
          )}
        </summary>

        <div className="flex flex-col gap-2 border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="mb-1 text-xs font-semibold">系統</p>
            <div className="flex flex-wrap gap-1">
              {data.families.map((f) => {
                const on = families.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFamilies((s) => toggle(s, f.id))}
                    aria-pressed={on}
                    className="flex min-h-9 items-center gap-1 rounded-lg border px-2 text-xs transition"
                    style={{
                      borderColor: on ? familyColor(f.id) : 'var(--border)',
                      background: on ? familyColor(f.id) : '#ffffff',
                      color: on ? '#ffffff' : 'var(--muted)',
                    }}
                  >
                    <FamilyIcon familyId={f.id} className="h-3.5 w-3.5" />
                    {f.name.replace('系', '')}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold">ランク</p>
            <div className="flex flex-wrap gap-1">
              {data.ranks.map((r) => {
                const on = ranks.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRanks((s) => toggle(s, r.id))}
                    aria-pressed={on}
                    className={`min-h-9 min-w-9 rounded-lg border px-2 text-xs font-bold transition ${
                      on
                        ? 'border-[var(--brand-700)] bg-[var(--brand-700)] text-white'
                        : 'bg-white text-[var(--muted)]'
                    }`}
                    style={on ? undefined : { borderColor: 'var(--border)' }}
                  >
                    {r.id}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">
              該当 <span className="font-bold tabular-nums">{matched.length}</span>体
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clear}
                className="min-h-9 rounded px-2 text-xs text-[var(--brand-700)] underline"
              >
                絞り込みを解除
              </button>
            )}
          </div>
        </div>
      </details>

      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- 選択してください --</option>
        {grouped.map((g) => (
          <optgroup key={g.family.id} label={g.family.name}>
            {g.monsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.rank}
                {m.obtainable ? `・${acquisitionLabel(m.acquisition)}` : ''}）
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
