'use client';
// モンスター選択UI: テキストで絞り込み → 系統別グループのセレクトで選ぶ
import { useMemo, useState } from 'react';
import type { TitleData } from '@/lib/engine/types';

export function monsterLabel(data: TitleData, monsterId: string): string {
  const m = data.monsters.find((x) => x.id === monsterId);
  if (!m) return monsterId;
  const fam = data.families.find((f) => f.id === m.familyId)?.name ?? m.familyId;
  return `${m.name}（${m.rank}・${fam}）`;
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

  const grouped = useMemo(() => {
    const hit = data.monsters.filter((m) => !filter || m.name.includes(filter));
    return data.families
      .map((f) => ({ family: f, monsters: hit.filter((m) => m.familyId === f.id) }))
      .filter((g) => g.monsters.length > 0);
  }, [data, filter]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
        placeholder="名前で絞り込み"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <select
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">-- 選択してください --</option>
        {grouped.map((g) => (
          <optgroup key={g.family.id} label={g.family.name}>
            {g.monsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.rank}{m.obtainable ? '・野生' : ''}）
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
