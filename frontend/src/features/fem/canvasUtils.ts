/**
 * Pure geometry/canvas utility functions.
 * Extracted for testability.
 */

/** Convert canvas pixel coords to world coords. */
export function canvasToWorld(
  px: number,
  py: number,
  offset: { x: number; y: number },
  zoom: number,
  canvasW: number,
  canvasH: number,
): [number, number] {
  const wx = (px - canvasW / 2) / zoom + offset.x
  const wy = -(py - canvasH / 2) / zoom + offset.y
  return [wx, wy]
}

/** Convert world coords to canvas pixel coords. */
export function worldToCanvas(
  wx: number,
  wy: number,
  offset: { x: number; y: number },
  zoom: number,
  canvasW: number,
  canvasH: number,
): [number, number] {
  const px = (wx - offset.x) * zoom + canvasW / 2
  const py = -(wy - offset.y) * zoom + canvasH / 2
  return [px, py]
}

/** Compute dynamic grid spacing from zoom level. */
export function computeGridSpacing(zoom: number): number {
  const rawSpacing = 50 / zoom
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)))
  if (rawSpacing / magnitude > 5) return magnitude * 10
  if (rawSpacing / magnitude > 2) return magnitude * 5
  if (rawSpacing / magnitude > 1) return magnitude * 2
  return magnitude
}
