'use client';
// React Flow用のモンスターノード。配合の親子は「親が上・子が下」で接続する。
// 枠線・背景＝配合の状態、左端の帯＝系統（役割の違う情報を色で混ぜない）。
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Orientation } from '@/components/Orientation';

export type MonsterNodeStatus = 'ok' | 'ng' | 'warn' | 'wild' | 'none';

export type MonsterNodeData = {
  label: string;
  sub: string;
  status: MonsterNodeStatus;
  /** 系統の識別色。指定があればノード左端に帯で表示する */
  familyColor?: string;
  rank?: string;
  /** フロー図の向き。縦なら上下、横なら左右に接続点を置く */
  orientation?: Orientation;
  /** 押すと配合手順を開閉できるノードか */
  expandable?: boolean;
  /** エディタでの検証・保存用。自動生成ツリーでは未使用 */
  monsterId?: string;
};

export type MonsterFlowNode = Node<MonsterNodeData, 'monster'>;

const statusStyles: Record<MonsterNodeStatus, string> = {
  ok: 'border-[var(--status-ok)] bg-[#f1faf5]',
  ng: 'border-[var(--status-ng)] bg-[#fef2f2]',
  warn: 'border-[var(--status-warn)] bg-[#fffbeb]',
  wild: 'border-[var(--status-info)] bg-[#f0f7fd]',
  none: 'border-[var(--border)] bg-white',
};

/** 画像として書き出すときに使う実際の色（CSSクラスと同じ見た目にする） */
export const statusColors: Record<MonsterNodeStatus, { border: string; bg: string }> = {
  ok: { border: '#157f4d', bg: '#f1faf5' },
  ng: { border: '#c92a2a', bg: '#fef2f2' },
  warn: { border: '#b45309', bg: '#fffbeb' },
  wild: { border: '#1c6fb8', bg: '#f0f7fd' },
  none: { border: '#dfe3ee', bg: '#ffffff' },
};

// 接続点は指でも掴めるよう既定より大きくする
const handleClass = '!h-4 !w-4 !border-2 !border-[var(--brand-500)] !bg-white';

export function MonsterNode({ data, selected }: NodeProps<MonsterFlowNode>) {
  // 横向きのときは左から右へ流れるよう接続点を左右に置く
  const horizontal = data.orientation === 'horizontal';
  const targetPosition = horizontal ? Position.Left : Position.Top;
  const sourcePosition = horizontal ? Position.Right : Position.Bottom;

  return (
    <div
      // 入手方法の説明が長いモンスターがいるので幅に上限を付ける。
      // 上限が無いとノードが極端に横長になり、隣のノードと重なって図が読めなくなる
      className={`relative min-w-40 max-w-52 overflow-hidden rounded-lg border-2 py-2 pl-4 pr-3 text-xs shadow-sm transition ${
        statusStyles[data.status]
      } ${selected ? 'ring-2 ring-[var(--brand-500)] ring-offset-1' : ''} ${
        data.expandable ? 'cursor-pointer hover:shadow-md' : ''
      }`}
    >
      {data.familyColor && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: data.familyColor }}
        />
      )}
      <Handle type="target" position={targetPosition} className={handleClass} />
      <div className="font-bold text-[var(--foreground)]">{data.label}</div>
      <div className="mt-0.5 whitespace-pre-line text-[10px] leading-snug text-[var(--muted)]">
        {data.sub}
      </div>
      <Handle type="source" position={sourcePosition} className={handleClass} />
    </div>
  );
}

export const nodeTypes = { monster: MonsterNode };
