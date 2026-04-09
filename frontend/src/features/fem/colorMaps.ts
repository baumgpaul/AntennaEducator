/**
 * Color map utilities for FEM field visualization.
 *
 * Pure functions mapping normalized scalar values [0,1] to RGB triplets.
 * Used by FEMResultsCanvas for vertex-colored contour rendering.
 */

import type { ColorMapName } from '@/types/femResults'

export type RGB = [number, number, number]

/** Linearly interpolate between two RGB colors. */
function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

/** Piecewise-linear color map from an array of control points. */
function piecewiseColorMap(stops: { t: number; color: RGB }[], value: number): RGB {
  if (value <= stops[0].t) return stops[0].color
  if (value >= stops[stops.length - 1].t) return stops[stops.length - 1].color

  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].t && value <= stops[i + 1].t) {
      const local = (value - stops[i].t) / (stops[i + 1].t - stops[i].t)
      return lerpColor(stops[i].color, stops[i + 1].color, local)
    }
  }
  return stops[stops.length - 1].color
}

// ── Color map definitions (control points) ────────────────────

const VIRIDIS_STOPS: { t: number; color: RGB }[] = [
  { t: 0.0, color: [68, 1, 84] },
  { t: 0.25, color: [59, 82, 139] },
  { t: 0.5, color: [33, 145, 140] },
  { t: 0.75, color: [94, 201, 98] },
  { t: 1.0, color: [253, 231, 37] },
]

const JET_STOPS: { t: number; color: RGB }[] = [
  { t: 0.0, color: [0, 0, 131] },
  { t: 0.125, color: [0, 60, 170] },
  { t: 0.25, color: [0, 150, 255] },
  { t: 0.375, color: [0, 255, 255] },
  { t: 0.5, color: [0, 255, 0] },
  { t: 0.625, color: [255, 255, 0] },
  { t: 0.75, color: [255, 170, 0] },
  { t: 0.875, color: [255, 60, 0] },
  { t: 1.0, color: [128, 0, 0] },
]

const COOLWARM_STOPS: { t: number; color: RGB }[] = [
  { t: 0.0, color: [59, 76, 192] },
  { t: 0.25, color: [141, 176, 254] },
  { t: 0.5, color: [221, 221, 221] },
  { t: 0.75, color: [245, 150, 118] },
  { t: 1.0, color: [180, 4, 38] },
]

const PLASMA_STOPS: { t: number; color: RGB }[] = [
  { t: 0.0, color: [13, 8, 135] },
  { t: 0.25, color: [126, 3, 168] },
  { t: 0.5, color: [204, 71, 120] },
  { t: 0.75, color: [248, 149, 64] },
  { t: 1.0, color: [240, 249, 33] },
]

const INFERNO_STOPS: { t: number; color: RGB }[] = [
  { t: 0.0, color: [0, 0, 4] },
  { t: 0.25, color: [87, 16, 110] },
  { t: 0.5, color: [188, 55, 84] },
  { t: 0.75, color: [249, 142, 9] },
  { t: 1.0, color: [252, 255, 164] },
]

const COLOR_MAP_REGISTRY: Record<ColorMapName, { t: number; color: RGB }[]> = {
  viridis: VIRIDIS_STOPS,
  jet: JET_STOPS,
  coolwarm: COOLWARM_STOPS,
  plasma: PLASMA_STOPS,
  inferno: INFERNO_STOPS,
}

/**
 * Map a normalized value [0,1] to an RGB triplet using the named color map.
 * Values outside [0,1] are clamped.
 */
export function mapValueToColor(
  value: number,
  colorMapName: ColorMapName,
): RGB {
  const t = Math.max(0, Math.min(1, value))
  const stops = COLOR_MAP_REGISTRY[colorMapName]
  return piecewiseColorMap(stops, t)
}

/**
 * Normalize a raw field value to [0,1] given the field's min/max range.
 * Returns 0 when min === max (uniform field).
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number,
): number {
  if (max === min) return 0
  return (value - min) / (max - min)
}

/** Convert RGB [0-255] to CSS hex string. */
export function rgbToHex(rgb: RGB): string {
  const r = Math.round(Math.max(0, Math.min(255, rgb[0])))
  const g = Math.round(Math.max(0, Math.min(255, rgb[1])))
  const b = Math.round(Math.max(0, Math.min(255, rgb[2])))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Convert RGB [0-255] to CSS rgba() string. */
export function rgbToRgba(rgb: RGB, alpha: number = 1): string {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha})`
}

/**
 * Generate color bar samples: an array of {t, color} for rendering a gradient bar.
 */
export function generateColorBarSamples(
  colorMapName: ColorMapName,
  nSamples: number = 64,
): { t: number; color: RGB }[] {
  const samples: { t: number; color: RGB }[] = []
  for (let i = 0; i < nSamples; i++) {
    const t = i / (nSamples - 1)
    samples.push({ t, color: mapValueToColor(t, colorMapName) })
  }
  return samples
}
