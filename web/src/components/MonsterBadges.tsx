// 系統・ランク・入手手段の表示を統一するための小さな表示部品。
// 色は補助情報であり、識別は必ずテキスト（系統名・ランク文字）と併記する。
import type { AcquisitionKind, TitleData } from '@/lib/engine/types';

const familyColors: Record<string, string> = {
  slime: 'var(--family-slime)',
  dragon: 'var(--family-dragon)',
  nature: 'var(--family-nature)',
  beast: 'var(--family-beast)',
  demon: 'var(--family-demon)',
  zombie: 'var(--family-zombie)',
  material: 'var(--family-material)',
  unknown: 'var(--family-unknown)',
};

export function familyColor(familyId: string): string {
  return familyColors[familyId] ?? 'var(--muted)';
}

export function familyName(data: TitleData, familyId: string): string {
  return data.families.find((f) => f.id === familyId)?.name ?? familyId;
}

export function FamilyBadge({ data, familyId }: { data: TitleData; familyId: string }) {
  return (
    <span className="family-badge">
      <span className="family-dot" style={{ background: familyColor(familyId) }} />
      {familyName(data, familyId)}
    </span>
  );
}

/** ランクは順序のある指標なので、単一色相の濃淡で上位ほど濃く見せる */
export function RankBadge({ rank, data }: { rank: string; data: TitleData }) {
  const total = Math.max(data.ranks.length - 1, 1);
  const order = data.ranks.find((r) => r.id === rank)?.order ?? 0;
  const t = order / total;
  // 明度を 92% → 32% へ落としていく（濃いほど上位ランク）
  const lightness = 92 - t * 60;
  return (
    <span
      className="rank-badge"
      style={{
        background: `hsl(230 45% ${lightness}%)`,
        color: lightness > 62 ? 'var(--brand-900)' : '#ffffff',
      }}
      title={`${rank}ランク`}
    >
      {rank}
    </span>
  );
}

export function acquisitionLabel(kind: AcquisitionKind | undefined): string {
  if (kind === 'egg') return 'タマゴ';
  if (kind === 'event') return 'イベント';
  return '野生';
}

export function AcquisitionBadge({ kind }: { kind: AcquisitionKind | undefined }) {
  const styles: Record<string, string> = {
    wild: 'bg-sky-50 text-sky-800 border-sky-200',
    egg: 'bg-amber-50 text-amber-800 border-amber-200',
    event: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] ${
        styles[kind ?? 'wild']
      }`}
    >
      {acquisitionLabel(kind)}
    </span>
  );
}
