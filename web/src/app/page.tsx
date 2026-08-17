'use client';
import Link from 'next/link';
import { useTitleData } from '@/components/TitleProvider';

const modes = [
  {
    href: '/simulate',
    title: '配合シミュレータ',
    desc: '親2体を選ぶと、通常配合・特殊配合で生まれる子候補を表示します。',
  },
  {
    href: '/auto',
    title: '自動チャート生成',
    desc: '目標のモンスターを選ぶと、野生で仲間にできるモンスターから始まる配合チャートを自動で逆算します。',
  },
  {
    href: '/editor',
    title: '手動チャートエディタ',
    desc: 'モンスターを自由に配置して線でつなぎ、配合計画を自分で組み立てます。配合ルールに合っているかを自動チェックします。',
  },
];

export default function Home() {
  const data = useTitleData();
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-bold">{data.name} 配合チャート</h1>
        <p className="mt-1 text-sm text-zinc-600">
          モンスター {data.monsters.length} 体・特殊配合 {data.specialRecipes.length} 件を収録
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {modes.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow"
          >
            <h2 className="font-semibold">{m.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{m.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
