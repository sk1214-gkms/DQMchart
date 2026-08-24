'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { FamilyMark, familyBackground, familyColor } from '@/components/MonsterBadges';
import { useTitleData } from '@/components/TitleProvider';

const modes = [
  {
    href: '/monster',
    icon: '🔍',
    title: 'モンスターを調べる',
    desc: 'モンスターを選ぶと、そのモンスターの作り方（特殊配合・位階配合）と、そのモンスターを使って作れるものを表示します。',
  },
  {
    href: '/simulate',
    icon: '⚗',
    title: '配合シミュレータ',
    desc: '親2体を選ぶと、通常配合・特殊配合で生まれる子候補を表示します。',
  },
  {
    href: '/auto',
    icon: '✦',
    title: '配合チャート',
    desc: '目標のモンスターを選ぶと、手に入るモンスターから始まる配合の手順をまとめて逆算します。',
  },
  {
    href: '/editor',
    icon: '✎',
    title: '手動チャートエディタ',
    desc: 'モンスターを自由に配置して線でつなぎ、配合計画を組み立てます。配合ルールに合っているか自動でチェックします。',
  },
];

export default function Home() {
  const data = useTitleData();

  const stats = useMemo(() => {
    const obtainable = data.monsters.filter((m) => m.obtainable).length;
    return [
      { label: 'モンスター', value: data.monsters.length },
      { label: '特殊配合', value: data.specialRecipes.length },
      { label: '配合なしで入手', value: obtainable },
    ];
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--brand-700),var(--brand-500))] p-5 text-white shadow-md sm:p-7">
        <p className="text-xs font-medium tracking-widest text-white/70">BREEDING CHART</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{data.name}</h1>
        <p className="mt-1 text-sm text-white/80">
          目標のモンスターまでの配合ルートを、逆算・シミュレート・作図できます。
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-white/12 px-3 py-2 backdrop-blur-sm">
              <dt className="text-[11px] text-white/75">{s.label}</dt>
              <dd className="text-lg font-bold tabular-nums sm:text-xl">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {modes.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="card group flex flex-col gap-2 transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-lg bg-[#eef3fd] text-lg text-[var(--brand-700)] transition group-hover:bg-[var(--brand-500)] group-hover:text-white"
            >
              {m.icon}
            </span>
            <h2 className="font-bold">{m.title}</h2>
            <p className="text-sm leading-relaxed text-[var(--muted)]">{m.desc}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <h2 className="text-sm font-bold">収録している系統</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.families.map((f) => {
            const count = data.monsters.filter((m) => m.familyId === f.id).length;
            return (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-lg border p-2"
                style={{
                  background: familyBackground(f.id),
                  borderColor: familyColor(f.id),
                }}
              >
                <FamilyMark familyId={f.id} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{f.name}</div>
                  <div className="text-[11px] tabular-nums text-[var(--muted)]">{count}体</div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
