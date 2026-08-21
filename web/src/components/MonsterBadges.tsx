// 系統・ランク・入手手段の表示を統一するための小さな表示部品。
// 系統はアイコン＋色＋名前、ランクはテキストで表す。
import { FamilyIcon } from '@/components/FamilyIcon';
import type { AcquisitionKind, TitleData } from '@/lib/engine/types';

// 画像として書き出すときSVG内ではCSS変数が解決されないため、色は実際の値で持つ
// （globals.css の --family-* と同じ値にすること）
const familyColors: Record<string, string> = {
  slime: '#2a78d6',
  dragon: '#1baf7a',
  nature: '#008300',
  beast: '#eb6834',
  demon: '#e34948',
  zombie: '#4a3aa7',
  material: '#eda100',
  unknown: '#e87ba4',
};

const familyBackgrounds: Record<string, string> = {
  slime: '#eef4fd',
  dragon: '#ecf8f3',
  nature: '#ebf5eb',
  beast: '#fdf1ec',
  demon: '#fdeeee',
  zombie: '#f0eef9',
  material: '#fdf6e7',
  unknown: '#fdeff4',
};

export function familyColor(familyId: string): string {
  return familyColors[familyId] ?? '#5b6478';
}

/** カード背景に使う淡い系統色 */
export function familyBackground(familyId: string): string {
  return familyBackgrounds[familyId] ?? '#ffffff';
}

export function familyName(data: TitleData, familyId: string): string {
  return data.families.find((f) => f.id === familyId)?.name ?? familyId;
}

/** 系統アイコンを丸チップに載せたもの（一覧の先頭に置く） */
export function FamilyMark({
  familyId,
  size = 'md',
}: {
  familyId: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-10 w-10' }[size];
  const icon = { sm: 'h-3.5 w-3.5', md: 'h-4.5 w-4.5', lg: 'h-6 w-6' }[size];
  return (
    <span
      className={`family-chip ${box}`}
      style={{ background: familyColor(familyId), color: '#ffffff' }}
    >
      <FamilyIcon familyId={familyId} className={icon} />
    </span>
  );
}

export function FamilyBadge({ data, familyId }: { data: TitleData; familyId: string }) {
  return (
    <span className="family-badge">
      <span style={{ color: familyColor(familyId) }}>
        <FamilyIcon familyId={familyId} className="h-3.5 w-3.5" />
      </span>
      {familyName(data, familyId)}
    </span>
  );
}

/** ランクはテキストで表記する */
export function RankText({ rank }: { rank: string }) {
  return <span className="rank-text">{rank}ランク</span>;
}

export function acquisitionLabel(kind: AcquisitionKind | undefined): string {
  if (kind === 'egg') return 'タマゴ';
  if (kind === 'event') return 'イベント';
  if (kind === 'transfer') return '他作品';
  return '野生';
}

export function AcquisitionBadge({
  kind,
  discontinued,
}: {
  kind: AcquisitionKind | undefined;
  discontinued?: boolean;
}) {
  const styles: Record<string, string> = {
    wild: 'bg-sky-50 text-sky-800 border-sky-200',
    egg: 'bg-amber-50 text-amber-800 border-amber-200',
    event: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
  };
  if (discontinued) {
    return (
      <span
        className="inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500"
        title="配信・通信が終了しているため、今から入手することはできません"
      >
        配信終了
      </span>
    );
  }
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
