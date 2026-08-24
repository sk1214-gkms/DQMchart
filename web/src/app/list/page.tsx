'use client';
// モンスター図鑑: そのタイトルのモンスターを一覧して探す。
//
// 名前が分かっているなら「モンスターを調べる」の絞り込みで足りるが、
// 「？？？系のSSランクって何がいるんだっけ」のように眺めて探す入口が無かった。
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FamilyIcon } from '@/components/FamilyIcon';
import {
  AcquisitionBadge,
  familyBackground,
  familyColor,
  familyName,
} from '@/components/MonsterBadges';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';
import { setKey } from '@/lib/localStore';
import { useStoredValue } from '@/lib/useStoredValue';
import type { Monster } from '@/lib/engine/types';

type SortKey = 'tier' | 'rank' | 'name';

/** 集合の要素をトグルする */
function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** 一覧の1件 */
function MonsterCard({
  monster,
  reachable,
  onPick,
}: {
  monster: Monster;
  reachable: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(monster.id)}
      className="flex min-h-16 items-start gap-2 rounded-lg border p-2 text-left transition hover:shadow-md active:translate-y-px"
      style={{
        background: familyBackground(monster.familyId),
        borderColor: familyColor(monster.familyId),
        opacity: reachable ? 1 : 0.55,
      }}
    >
      <FamilyIcon familyId={monster.familyId} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{monster.name}</div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--muted)]">
          <span className="font-bold">{monster.rank}</span>
          {monster.tier !== undefined && <span>位階{monster.tier}</span>}
        </div>
        <div className="mt-0.5">
          {monster.obtainable ? (
            <AcquisitionBadge kind={monster.acquisition} discontinued={monster.discontinued} />
          ) : (
            <span className="inline-flex items-center rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
              配合で作る
            </span>
          )}
          {!reachable && (
            <span className="ml-1 inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
              入手不可
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ListPage() {
  const data = useTitleData();
  const engine = useMemo(() => getRuleset(data.ruleset), [data.ruleset]);
  const router = useRouter();

  const [filter, setFilter] = useState('');
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [ranks, setRanks] = useState<Set<string>>(new Set());
  const [sort, setSort] = useStoredValue(
    'haigou-list-sort',
    useCallback((v: string) => v === 'tier' || v === 'rank' || v === 'name', []),
  );
  const [hideUnreachable, setHideUnreachable] = useStoredValue(
    'haigou-list-hide',
    useCallback((v: string) => v === 'on' || v === 'off', []),
  );
  const [grouped, setGrouped] = useStoredValue(
    'haigou-list-group',
    useCallback((v: string) => v === 'on' || v === 'off', []),
  );
  const sortKey = (sort || (data.ruleset === 'dqm3' ? 'rank' : 'tier')) as SortKey;
  const hide = hideUnreachable === 'on';
  const byFamily = grouped !== 'off';

  // 今このタイトルで手に入るか。逆算はタイトル単位で1回計算すれば使い回せる
  const reachable = useMemo(() => {
    const out = new Set<string>();
    for (const m of data.monsters) if (engine.plan(m.id, data)) out.add(m.id);
    return out;
  }, [engine, data]);

  const rankOrder = useMemo(
    () => new Map(data.ranks.map((r) => [r.id, r.order])),
    [data.ranks],
  );

  const shown = useMemo(() => {
    const list = data.monsters.filter((m) => {
      if (filter && !m.name.includes(filter)) return false;
      if (families.size && !families.has(m.familyId)) return false;
      if (ranks.size && !ranks.has(m.rank)) return false;
      if (hide && !reachable.has(m.id)) return false;
      return true;
    });
    const cmp = (a: Monster, b: Monster) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ja');
      if (sortKey === 'rank') {
        const d = (rankOrder.get(a.rank) ?? 0) - (rankOrder.get(b.rank) ?? 0);
        if (d !== 0) return d;
      }
      return (a.tier ?? Number.MAX_SAFE_INTEGER) - (b.tier ?? Number.MAX_SAFE_INTEGER);
    };
    return list.sort(cmp);
  }, [data, filter, families, ranks, hide, reachable, sortKey, rankOrder]);

  // 系統ごとにまとめる（そのほうが目的のモンスターを見つけやすい）
  const groups = useMemo(() => {
    if (!byFamily) return [{ family: null, monsters: shown }];
    return data.families
      .map((f) => ({ family: f, monsters: shown.filter((m) => m.familyId === f.id) }))
      .filter((g) => g.monsters.length > 0);
  }, [byFamily, data.families, shown]);

  /** 選んだモンスターを詳細画面で開く */
  const open = useCallback(
    (id: string) => {
      setKey(`haigou-monster-${data.id}`, id);
      router.push('/monster');
    },
    [data.id, router],
  );

  const activeCount = families.size + ranks.size + (filter ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-xl font-bold">モンスター図鑑</h1>
        <span className="text-sm text-[var(--muted)]">
          {shown.length}体 / 全{data.monsters.length}体
        </span>
      </div>

      <div className="card flex flex-col gap-3">
        <input
          className="field"
          type="search"
          placeholder="名前で絞り込み"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <div>
          <p className="mb-1 text-xs font-semibold">系統</p>
          <div className="flex flex-wrap gap-1">
            {data.families.map((f) => {
              const on = families.has(f.id);
              const n = data.monsters.filter((m) => m.familyId === f.id).length;
              return (
                <button
                  key={f.id}
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
                  <span className="tabular-nums opacity-70">{n}</span>
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
              const n = data.monsters.filter((m) => m.rank === r.id).length;
              return (
                <button
                  key={r.id}
                  onClick={() => setRanks((s) => toggle(s, r.id))}
                  aria-pressed={on}
                  className={`min-h-9 rounded-lg border px-2.5 text-xs font-bold transition ${
                    on
                      ? 'border-[var(--brand-700)] bg-[var(--brand-700)] text-white'
                      : 'bg-white text-[var(--muted)]'
                  }`}
                  style={on ? undefined : { borderColor: 'var(--border)' }}
                >
                  {r.id}
                  <span className="ml-1 font-normal tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <label className="flex items-center gap-1.5 text-xs">
            並び順
            <select
              className="field w-auto py-1 text-xs"
              value={sortKey}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="tier">位階順</option>
              <option value="rank">ランク順</option>
              <option value="name">名前順</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={byFamily}
              onChange={(e) => setGrouped(e.target.checked ? 'on' : 'off')}
            />
            系統ごとに分ける
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hide}
              onChange={(e) => setHideUnreachable(e.target.checked ? 'on' : 'off')}
            />
            今は入手できないものを隠す
          </label>
          {activeCount > 0 && (
            <button
              onClick={() => {
                setFilter('');
                setFamilies(new Set());
                setRanks(new Set());
              }}
              className="btn btn-outline ml-auto text-xs"
            >
              絞り込みを解除
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">条件に合うモンスターがいません。</p>
      ) : (
        groups.map((g) => (
          <section key={g.family?.id ?? 'all'}>
            {g.family && (
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <FamilyIcon familyId={g.family.id} className="h-4 w-4" />
                {g.family.name}
                <span className="text-sm font-normal text-[var(--muted)]">
                  {g.monsters.length}体
                </span>
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {g.monsters.map((m) => (
                <li key={m.id}>
                  <MonsterCard monster={m} reachable={reachable.has(m.id)} onPick={open} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="text-xs text-[var(--muted)]">
        モンスターを押すと、そのモンスターの作り方と使い道を表示します。
        「入手不可」は配信終了などで今は手に入らないものです（{familyName(data, 'unknown')}
        などにも含まれます）。
      </p>
    </div>
  );
}
