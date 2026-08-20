'use client';
// 配合手順をツリー形式で表示する。
// 手数が多いモンスターは番号付きの一覧だと構造が追えないため、
// 親子関係をそのままインデントで見せる。
// 同じモンスターが再び出てきたときは中身を畳んで「上記と同じ」にまとめる。
import { useMemo, useState } from 'react';
import type { BreedingPlan, Monster, TitleData } from '@/lib/engine/types';
import { acquisitionLabel, familyName } from '@/components/MonsterBadges';

const METHOD_LABEL: Record<string, string> = {
  normal: '配合',
  special: '特殊配合',
  quad: '4体配合',
};

/** ツリーの1行 */
type TreeLine = {
  text: string;
  monster: Monster;
  depth: number;
  repeated: boolean;
};

/** 何回も出てくるモンスターは2回目以降を畳んで、ツリー全体を小さくする */
function buildLines(plan: BreedingPlan): TreeLine[] {
  const lines: TreeLine[] = [];
  const expandedOnce = new Set<string>();

  const describe = (p: BreedingPlan, repeated: boolean, count: number): string => {
    const m = p.monster;
    // 4体配合で同じモンスターを複数使うことがあるので「×2」のようにまとめる
    const name = count > 1 ? `${m.name} ×${count}` : m.name;
    if (repeated) return `${name}（上記と同じ）`;
    if (p.kind === 'wild') {
      const how = m.acquisitionDetail
        ? m.acquisitionDetail.split(/[／/。]/)[0].trim()
        : `${acquisitionLabel(m.acquisition)}で入手`;
      return `${name}（${how}）`;
    }
    return `${name}（${METHOD_LABEL[p.method] ?? '配合'}）`;
  };

  const walk = (p: BreedingPlan, prefix: string, isLast: boolean, depth: number, count = 1) => {
    const connector = depth === 0 ? '' : isLast ? '└─ ' : '├─ ';
    const repeated = p.kind === 'breed' && expandedOnce.has(p.monster.id);
    lines.push({
      text: prefix + connector + describe(p, repeated, count),
      monster: p.monster,
      depth,
      repeated,
    });

    if (p.kind !== 'breed' || repeated) return;
    expandedOnce.add(p.monster.id);

    const childPrefix = depth === 0 ? '' : prefix + (isLast ? '   ' : '│  ');
    // 同じモンスターが複数要る場合は1行にまとめる（同じ素材なら手順も同じため）
    const groups: Array<{ plan: BreedingPlan; count: number }> = [];
    for (const parent of p.parents) {
      const same = groups.find((g) => g.plan.monster.id === parent.monster.id);
      if (same) same.count += 1;
      else groups.push({ plan: parent, count: 1 });
    }
    groups.forEach((g, i) => {
      walk(g.plan, childPrefix, i === groups.length - 1, depth + 1, g.count);
    });
  };

  walk(plan, '', true, 0);
  return lines;
}

export function PlanTree({ plan, data }: { plan: BreedingPlan; data: TitleData }) {
  const lines = useMemo(() => buildLines(plan), [plan]);
  const [copied, setCopied] = useState(false);

  const asText = lines.map((l) => l.text).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では何もしない（テキストは画面から選択できる）
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--muted)]">
          同じモンスターが何度も要るときは、2回目以降を「上記と同じ」にまとめています
        </span>
        <button onClick={copy} className="btn btn-outline ml-auto shrink-0 text-xs">
          {copied ? 'コピーしました' : '文字でコピー'}
        </button>
      </div>
      <div
        className="overflow-x-auto rounded-lg border bg-white p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <pre className="font-mono text-xs leading-relaxed">
          {lines.map((l, i) => (
            <div key={i} className={l.repeated ? 'text-[var(--muted)]' : ''}>
              {l.text}
              <span className="ml-2 text-[10px] text-[var(--muted)]">
                {l.monster.rank}・{familyName(data, l.monster.familyId)}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
