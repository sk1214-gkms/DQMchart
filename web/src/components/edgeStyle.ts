// 配合線の見た目。
// CSSクラスで指定すると画像として書き出すときにスタイルが引き継がれず線が消えるため、
// エッジ自身のstyle・markerとして持たせている。
import { MarkerType } from '@xyflow/react';
import type { Edge } from '@xyflow/react';

export const EDGE_COLOR = '#7c8aa8';

export const edgeDefaults: Pick<Edge, 'style' | 'markerEnd'> = {
  style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 18, height: 18 },
};
