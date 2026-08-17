'use client';
// React Flow用のモンスターノード。配合の親子は「親が上・子が下」で接続する。
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

export type MonsterNodeStatus = 'ok' | 'ng' | 'warn' | 'wild' | 'none';

export type MonsterNodeData = {
  label: string;
  sub: string;
  status: MonsterNodeStatus;
  /** エディタでの検証・保存用。自動生成ツリーでは未使用 */
  monsterId?: string;
};

export type MonsterFlowNode = Node<MonsterNodeData, 'monster'>;

const statusStyles: Record<MonsterNodeStatus, string> = {
  ok: 'border-green-500 bg-green-50',
  ng: 'border-red-500 bg-red-50',
  warn: 'border-amber-500 bg-amber-50',
  wild: 'border-sky-400 bg-sky-50',
  none: 'border-zinc-300 bg-white',
};

export function MonsterNode({ data }: NodeProps<MonsterFlowNode>) {
  return (
    <div className={`min-w-36 rounded-md border-2 px-3 py-2 text-xs shadow-sm ${statusStyles[data.status]}`}>
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-zinc-900">{data.label}</div>
      <div className="text-[10px] text-zinc-500">{data.sub}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const nodeTypes = { monster: MonsterNode };
