/**
 * A picture of the potential for the PDF report: each triangle filled with the
 * colour of its mean V, the domain boundaries on top. Drawn on an offscreen 2D
 * canvas (the 3D viewer's WebGL canvas cannot be read back reliably).
 */
import { getColor, type ColorMapType } from '@/utils/colorMaps';
import type { SolveResult } from '../api';

export interface FieldImage {
  dataUrl: string;
  /** Width / height of the picture */
  aspect: number;
  min: number;
  max: number;
}

type Canvas2D = Pick<HTMLCanvasElement, 'width' | 'height' | 'getContext' | 'toDataURL'>;
const browserCanvas = (): Canvas2D => document.createElement('canvas');

/** Returns null where no 2D canvas is available (tests, very old browsers). */
export function potentialImage(
  result: SolveResult,
  { width = 1000, colorMap = 'viridis' as ColorMapType, makeCanvas = browserCanvas } = {},
): FieldImage | null {
  const { nodes, triangles, edges } = result.mesh;
  const V = result.potential;
  let [xmin, xmax, ymin, ymax] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < nodes.length; i += 2) {
    xmin = Math.min(xmin, nodes[i]);
    xmax = Math.max(xmax, nodes[i]);
    ymin = Math.min(ymin, nodes[i + 1]);
    ymax = Math.max(ymax, nodes[i + 1]);
  }
  const w = xmax - xmin;
  const h = ymax - ymin;
  if (!(w > 0 && h > 0)) return null;
  const aspect = Math.min(3, Math.max(1 / 3, w / h));
  const canvas = makeCanvas();
  canvas.width = width;
  canvas.height = Math.round(width / aspect);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;

  const pad = 0.02 * canvas.width;
  const s = Math.min((canvas.width - 2 * pad) / w, (canvas.height - 2 * pad) / h);
  const ox = (canvas.width - s * w) / 2;
  const oy = (canvas.height - s * h) / 2;
  const X = (i: number) => ox + (nodes[2 * i] - xmin) * s;
  const Y = (i: number) => canvas.height - (oy + (nodes[2 * i + 1] - ymin) * s); // y up

  let min = Infinity;
  let max = -Infinity;
  for (const v of V) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min || 1;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const color = getColor(((V[a] + V[b] + V[c]) / 3 - min) / span, colorMap);
    ctx.fillStyle = ctx.strokeStyle = `rgb(${Math.round(255 * color.r)},${Math.round(255 * color.g)},${Math.round(255 * color.b)})`;
    ctx.beginPath();
    ctx.moveTo(X(a), Y(a));
    ctx.lineTo(X(b), Y(b));
    ctx.lineTo(X(c), Y(c));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.5; // close the hairline gaps between neighbours
    ctx.stroke();
  }
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let e = 0; e < edges.length; e += 2) {
    ctx.moveTo(X(edges[e]), Y(edges[e]));
    ctx.lineTo(X(edges[e + 1]), Y(edges[e + 1]));
  }
  ctx.stroke();
  // JPEG: a smooth colour field compresses ~20x better than PNG in the PDF
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), aspect, min, max };
}
