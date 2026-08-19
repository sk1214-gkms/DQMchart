'use client';
// チャートをPNG画像として保存するボタン。
//
// DOMをそのまま画像化するライブラリ（html-to-image など）は、React Flowが配合線を描いている
// SVGを取り込めず線が消えてしまう。そのため、ノードと線の情報から自前でSVGを組み立て、
// それをcanvasでPNGに変換している。表示中の位置や拡大率に関係なく全体が収まる。
import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { statusColors } from '@/components/MonsterNode';
import type { MonsterFlowNode, MonsterNodeStatus } from '@/components/MonsterNode';
import { EDGE_COLOR } from '@/components/edgeStyle';

const PADDING = 40;
const SCALE = 2; // 文字がぼやけないように2倍で描く
const MAX_SIDE = 8000;

const FONT_STACK =
  '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",Meiryo,sans-serif';

/** ファイル名に使えない文字を置き換える */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'chart';
}

/** SVGに埋め込めるようにXMLの特殊文字を退避する */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ノード1つ分のSVG。画面上の見た目（枠＝状態、左帯＝系統）に合わせる */
function nodeToSvg(node: MonsterFlowNode): string {
  const w = node.measured?.width ?? 160;
  const h = node.measured?.height ?? 66;
  const { x, y } = node.position;
  const status = (node.data.status ?? 'none') as MonsterNodeStatus;
  const { border, bg } = statusColors[status] ?? statusColors.none;
  const clipId = `clip-${node.id}`;

  const lines = String(node.data.sub ?? '').split('\n');
  const subText = lines
    .map(
      (line, i) =>
        `<text x="16" y="${35 + i * 12}" font-size="10" fill="#5b6478">${escapeXml(line)}</text>`,
    )
    .join('');

  const familyBar = node.data.familyColor
    ? `<rect x="0" y="0" width="6" height="${h}" fill="${node.data.familyColor}"/>`
    : '';

  return `<g transform="translate(${x} ${y})">
    <clipPath id="${clipId}"><rect x="0" y="0" width="${w}" height="${h}" rx="8"/></clipPath>
    <rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="${bg}"/>
    <g clip-path="url(#${clipId})">${familyBar}</g>
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="7" fill="none" stroke="${border}" stroke-width="2"/>
    <text x="16" y="22" font-size="12" font-weight="bold" fill="#1b2233">${escapeXml(String(node.data.label ?? ''))}</text>
    ${subText}
  </g>`;
}

type Bounds = { x: number; y: number; width: number; height: number };

/** チャート全体をSVG文字列にする */
function buildSvg(nodes: MonsterFlowNode[], edgePaths: string[], bounds: Bounds): string {
  const x = bounds.x - PADDING;
  const y = bounds.y - PADDING;
  const w = bounds.width + PADDING * 2;
  const h = bounds.height + PADDING * 2;

  const edges = edgePaths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${EDGE_COLOR}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#chart-arrow)"/>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" font-family='${FONT_STACK}'>
    <defs>
      <marker id="chart-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${EDGE_COLOR}"/>
      </marker>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>
    ${edges}
    ${nodes.map(nodeToSvg).join('')}
  </svg>`;
}

/** SVG文字列をPNGのdata URLに変換する */
async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVGの読み込みに失敗しました'));
    image.src = url;
  });

  // 上限に当たっても縦横比が崩れないよう、倍率を一括で決める
  const scale = Math.min(SCALE, MAX_SIDE / width, MAX_SIDE / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvasを準備できませんでした');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function ChartImageButton({ fileName }: { fileName: string }) {
  // フックのgetNodesBoundsを使う（描画後の実寸を反映した範囲が得られる）
  const { getNodes, getNodesBounds } = useReactFlow<MonsterFlowNode>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const nodes = getNodes();
    if (nodes.length === 0) return;

    setBusy(true);
    setError('');
    try {
      // 線の形はReact Flowが計算済みなので、描かれているパスをそのまま使う
      const edgePaths = Array.from(
        document.querySelectorAll<SVGPathElement>('.react-flow__edge-path'),
      )
        .map((p) => p.getAttribute('d') ?? '')
        .filter(Boolean);

      const bounds = getNodesBounds(nodes);
      const svg = buildSvg(nodes, edgePaths, bounds);
      const dataUrl = await svgToPng(
        svg,
        bounds.width + PADDING * 2,
        bounds.height + PADDING * 2,
      );

      const link = document.createElement('a');
      link.download = `${safeFileName(fileName)}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError('画像の保存に失敗しました。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button onClick={save} disabled={busy} className="btn btn-outline text-sm">
        {busy ? '書き出し中…' : '画像として保存'}
      </button>
      {error && <span className="text-xs text-[var(--status-ng)]">{error}</span>}
    </div>
  );
}
