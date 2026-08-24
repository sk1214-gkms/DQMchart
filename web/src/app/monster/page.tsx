'use client';
// モンスター検索: 1体を選んで「どう作るか」「これで何が作れるか」を見る。
//
// 配合チャート（/auto）が目標から素材まで一気にさかのぼるのに対し、
// ここは1回の配合だけを見る。図鑑を引く感覚で使うための画面。
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { MonsterPicker } from '@/components/MonsterPicker';
import {
  AcquisitionBadge,
  FamilyMark,
  RankText,
  familyBackground,
  familyColor,
  familyName,
} from '@/components/MonsterBadges';
import { useTitleData } from '@/components/TitleProvider';
import { getRuleset } from '@/lib/engine/registry';
import { howToMake, usedFor } from '@/lib/engine/lookup';
import { useStoredValue } from '@/lib/useStoredValue';
import type { Monster, ParentPairGroup, TitleData } from '@/lib/engine/types';

/** モンスター名のチップ。押すとそのモンスターに移動する */
function MonsterChip({
  monster,
  data,
  onPick,
}: {
  monster: Monster;
  data: TitleData;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(monster.id)}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition hover:shadow-sm"
      style={{
        background: familyBackground(monster.familyId),
        borderColor: familyColor(monster.familyId),
      }}
      title={`${monster.rank}ランク・${familyName(data, monster.familyId)}`}
    >
      {monster.name}
      <span className="text-[10px] text-[var(--muted)]">{monster.rank}</span>
    </button>
  );
}

/** 相方の一覧。多いときは畳んでおく */
function PartnerList({
  partners,
  data,
  onPick,
}: {
  partners: Monster[];
  data: TitleData;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const LIMIT = 12;
  const shown = open ? partners : partners.slice(0, LIMIT);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((p, i) => (
        <MonsterChip key={`${p.id}-${i}`} monster={p} data={data} onPick={onPick} />
      ))}
      {partners.length > LIMIT && (
        <button
          onClick={() => setOpen(!open)}
          className="rounded border px-1.5 py-0.5 text-xs text-[var(--brand-700)]"
          style={{ borderColor: 'var(--border)' }}
        >
          {open ? '閉じる' : `ほか${partners.length - LIMIT}体`}
        </button>
      )}
    </span>
  );
}

/** 位階配合・通常配合の組み合わせ。軸の親ごとにまとめて出す */
function PairGroups({
  groups,
  data,
  onPick,
}: {
  groups: ParentPairGroup[];
  data: TitleData;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const LIMIT = 8;
  const shown = open ? groups : groups.slice(0, LIMIT);
  return (
    <div className="flex flex-col gap-2">
      {shown.map((g) => (
        <div
          key={g.basis.id}
          className="rounded-lg border bg-white p-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <MonsterChip monster={g.basis} data={data} onPick={onPick} />
            <span className="text-[var(--muted)]">×</span>
            <span className="text-xs text-[var(--muted)]">
              次のいずれか（{g.partners.length}体）
            </span>
          </div>
          <PartnerList partners={g.partners} data={data} onPick={onPick} />
        </div>
      ))}
      {groups.length > LIMIT && (
        <button
          onClick={() => setOpen(!open)}
          className="btn btn-outline self-start text-xs"
        >
          {open ? '組み合わせを畳む' : `ほか${groups.length - LIMIT}通りの組み合わせ`}
        </button>
      )}
    </div>
  );
}

const METHOD_LABEL = { normal: '通常・位階配合', special: '特殊配合', quad: '4体配合' } as const;

export default function MonsterPage() {
  const data = useTitleData();
  const engine = useMemo(() => getRuleset(data.ruleset), [data.ruleset]);

  const [monsterId, setMonsterId] = useStoredValue(
    `haigou-monster-${data.id}`,
    useCallback((v: string) => data.monsters.some((m) => m.id === v), [data]),
  );

  const how = useMemo(
    () => (monsterId ? howToMake(engine, data, monsterId) : null),
    [engine, data, monsterId],
  );
  const uses = useMemo(
    () => (monsterId ? usedFor(engine, data, monsterId) : []),
    [engine, data, monsterId],
  );

  // 上位ランクのものから先に出す
  const sortedUses = useMemo(() => {
    const rank = new Map(data.ranks.map((r) => [r.id, r.order]));
    return [...uses].sort(
      (a, b) => (rank.get(b.child.rank) ?? 0) - (rank.get(a.child.rank) ?? 0),
    );
  }, [uses, data.ranks]);

  const [showAllUses, setShowAllUses] = useState(false);
  const USE_LIMIT = 20;
  const shownUses = showAllUses ? sortedUses : sortedUses.slice(0, USE_LIMIT);

  const m = how?.monster;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">モンスターを調べる</h1>
      <div className="card max-w-sm">
        <MonsterPicker data={data} value={monsterId} onChange={setMonsterId} label="モンスター" />
      </div>

      {!m ? (
        <p className="text-sm text-[var(--muted)]">
          モンスターを選ぶと、そのモンスターの作り方と、そのモンスターを使って作れるものを表示します。
        </p>
      ) : (
        <>
          <div
            className="card flex flex-wrap items-center gap-3"
            style={{ background: familyBackground(m.familyId) }}
          >
            <FamilyMark familyId={m.familyId} />
            <div>
              <div className="text-lg font-bold">{m.name}</div>
              <div className="flex flex-wrap items-center gap-2">
                <RankText rank={m.rank} />
                <span className="text-xs text-[var(--muted)]">
                  {familyName(data, m.familyId)}
                </span>
                {m.tier !== undefined && (
                  <span className="text-xs text-[var(--muted)]">位階{m.tier}</span>
                )}
                {m.obtainable && (
                  <AcquisitionBadge kind={m.acquisition} discontinued={m.discontinued} />
                )}
              </div>
            </div>
          </div>

          <section className="card">
            <h2 className="mb-2 font-bold">
              <span aria-hidden className="mr-1.5 text-[var(--brand-500)]">
                ①
              </span>
              {m.name}の作り方
            </h2>

            {m.obtainable && (
              <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
                配合しなくても手に入ります
                {m.acquisitionDetail && (
                  <span className="block text-xs text-[var(--muted)]">{m.acquisitionDetail}</span>
                )}
              </p>
            )}

            {how.special.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1.5 text-sm font-bold text-[var(--muted)]">
                  特殊配合（{how.special.length}通り）
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {how.special.map((r) => (
                    <li
                      key={r.recipe.id}
                      className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2.5 py-2 text-sm"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {r.parents.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          {i > 0 && <span className="text-[var(--muted)]">×</span>}
                          {p.kind === 'monster' ? (
                            <MonsterChip monster={p.monster} data={data} onPick={setMonsterId} />
                          ) : (
                            <span className="rounded bg-[#eef3fd] px-1.5 py-0.5 text-xs text-[var(--brand-700)]">
                              {p.text}
                            </span>
                          )}
                        </span>
                      ))}
                      {r.quad && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
                          4体配合
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {how.special.some((r) => r.quad) && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    4体配合は、その4体を祖父母にして2回配合し、生まれた子同士を配合します。
                  </p>
                )}
              </div>
            )}

            {how.pairs.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold text-[var(--muted)]">
                  {data.ruleset === 'dqm3' ? '通常配合' : '位階配合'}（
                  {how.pairs.length}通りの組み合わせ）
                </h3>
                <PairGroups groups={how.pairs} data={data} onPick={setMonsterId} />
              </div>
            )}

            {how.special.length === 0 && how.pairs.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                {how.pairsUnsupported
                  ? 'この作品では配合の組み合わせを一覧にできません。配合チャートで確認してください。'
                  : '配合で作ることはできません。'}
              </p>
            )}
          </section>

          <section className="card">
            <h2 className="mb-2 font-bold">
              <span aria-hidden className="mr-1.5 text-[var(--brand-500)]">
                ②
              </span>
              {m.name}を使って作れるモンスター
              <span className="ml-1.5 text-sm font-normal text-[var(--muted)]">
                {sortedUses.length}件
              </span>
            </h2>
            <p className="mb-2 text-xs text-[var(--muted)]">
              特殊配合・4体配合だけを出しています（位階配合は含みません）。
            </p>
            {sortedUses.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                このモンスターを親に使う特殊配合はありません。
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5">
                  {shownUses.map((u, i) => (
                    <li
                      key={`${u.child.id}-${u.method}-${i}`}
                      className="rounded-lg border bg-white px-2.5 py-2 text-sm"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MonsterChip monster={u.child} data={data} onPick={setMonsterId} />
                        <span className="rounded bg-[#f2f5fc] px-1.5 text-[11px] text-[var(--muted)]">
                          {METHOD_LABEL[u.method]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-xs text-[var(--muted)]">相方:</span>
                        {u.partnerText && (
                          <span className="rounded bg-[#eef3fd] px-1.5 py-0.5 text-xs text-[var(--brand-700)]">
                            {u.partnerText}
                          </span>
                        )}
                        <PartnerList partners={u.partners} data={data} onPick={setMonsterId} />
                      </div>
                    </li>
                  ))}
                </ul>
                {sortedUses.length > USE_LIMIT && (
                  <button
                    onClick={() => setShowAllUses(!showAllUses)}
                    className="btn btn-outline mt-2 text-xs"
                  >
                    {showAllUses ? '畳む' : `ほか${sortedUses.length - USE_LIMIT}件を表示`}
                  </button>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2 className="mb-1 font-bold">
              <span aria-hidden className="mr-1.5 text-[var(--brand-500)]">
                ③
              </span>
              素材までさかのぼる
            </h2>
            <p className="mb-2 text-sm text-[var(--muted)]">
              手に入るモンスターから{m.name}までの手順をまとめて見たいときは配合チャートを使います。
            </p>
            <Link href="/auto" className="btn btn-primary inline-flex text-sm">
              配合チャートを開く
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
