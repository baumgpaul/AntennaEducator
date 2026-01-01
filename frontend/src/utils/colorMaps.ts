/**
 * Color map utilities for field visualization
 * Converts normalized scalar values (0-1) to RGB colors
 */

import * as THREE from 'three';

export type ColorMapType = 'jet' | 'turbo' | 'viridis' | 'plasma' | 'twilight';

/**
 * Jet color map (blue -> cyan -> green -> yellow -> red)
 */
function jetColorMap(t: number): THREE.Color {
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
  return new THREE.Color(r, g, b);
}

/**
 * Turbo color map (Google's improved rainbow)
 */
function turboColorMap(t: number): THREE.Color {
  const kRedVec4 = [0.13572138, 4.61539260, -42.66032258, 132.13108234];
  const kGreenVec4 = [0.09140261, 2.19418839, 4.84296658, -14.18503333];
  const kBlueVec4 = [0.10667330, 12.64194608, -60.58204836, 110.36276771];
  const kRedVec2 = [-152.94239396, 59.28637943];
  const kGreenVec2 = [4.27729857, 2.82956604];
  const kBlueVec2 = [-89.90310912, 27.34824973];

  const v4 = [1.0, t, t * t, t * t * t];
  const v2 = [v4[2] * t, v4[3] * t];

  const r = Math.max(0, Math.min(1, 
    kRedVec4[0] * v4[0] + kRedVec4[1] * v4[1] + kRedVec4[2] * v4[2] + kRedVec4[3] * v4[3] + 
    kRedVec2[0] * v2[0] + kRedVec2[1] * v2[1]
  ));
  const g = Math.max(0, Math.min(1,
    kGreenVec4[0] * v4[0] + kGreenVec4[1] * v4[1] + kGreenVec4[2] * v4[2] + kGreenVec4[3] * v4[3] + 
    kGreenVec2[0] * v2[0] + kGreenVec2[1] * v2[1]
  ));
  const b = Math.max(0, Math.min(1,
    kBlueVec4[0] * v4[0] + kBlueVec4[1] * v4[1] + kBlueVec4[2] * v4[2] + kBlueVec4[3] * v4[3] + 
    kBlueVec2[0] * v2[0] + kBlueVec2[1] * v2[1]
  ));

  return new THREE.Color(r, g, b);
}

/**
 * Viridis color map (perceptually uniform)
 */
function viridisColorMap(t: number): THREE.Color {
  const c0 = new THREE.Color(0.267004, 0.004874, 0.329415);
  const c1 = new THREE.Color(0.282623, 0.140926, 0.457517);
  const c2 = new THREE.Color(0.253935, 0.265254, 0.529983);
  const c3 = new THREE.Color(0.206756, 0.371758, 0.553117);
  const c4 = new THREE.Color(0.163625, 0.471133, 0.558148);
  const c5 = new THREE.Color(0.127568, 0.566949, 0.550556);
  const c6 = new THREE.Color(0.134692, 0.658636, 0.517649);
  const c7 = new THREE.Color(0.266941, 0.748751, 0.440573);
  const c8 = new THREE.Color(0.477504, 0.821444, 0.318195);
  const c9 = new THREE.Color(0.741388, 0.873449, 0.149561);
  const c10 = new THREE.Color(0.993248, 0.906157, 0.143936);

  const colors = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10];
  const idx = t * (colors.length - 1);
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, colors.length - 1);
  const frac = idx - i1;

  return new THREE.Color(
    colors[i1].r + (colors[i2].r - colors[i1].r) * frac,
    colors[i1].g + (colors[i2].g - colors[i1].g) * frac,
    colors[i1].b + (colors[i2].b - colors[i1].b) * frac
  );
}

/**
 * Plasma color map (perceptually uniform)
 */
function plasmaColorMap(t: number): THREE.Color {
  const c0 = new THREE.Color(0.050383, 0.029803, 0.527975);
  const c1 = new THREE.Color(0.254627, 0.013882, 0.615419);
  const c2 = new THREE.Color(0.417642, 0.000564, 0.658390);
  const c3 = new THREE.Color(0.562738, 0.051545, 0.641509);
  const c4 = new THREE.Color(0.692840, 0.165141, 0.564522);
  const c5 = new THREE.Color(0.798216, 0.280197, 0.469538);
  const c6 = new THREE.Color(0.881443, 0.392529, 0.383229);
  const c7 = new THREE.Color(0.949217, 0.517763, 0.295662);
  const c8 = new THREE.Color(0.988260, 0.652325, 0.211364);
  const c9 = new THREE.Color(0.987622, 0.809579, 0.145357);
  const c10 = new THREE.Color(0.940015, 0.975158, 0.131326);

  const colors = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10];
  const idx = t * (colors.length - 1);
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, colors.length - 1);
  const frac = idx - i1;

  return new THREE.Color(
    colors[i1].r + (colors[i2].r - colors[i1].r) * frac,
    colors[i1].g + (colors[i2].g - colors[i1].g) * frac,
    colors[i1].b + (colors[i2].b - colors[i1].b) * frac
  );
}

/**
 * Twilight color map (cyclic, good for phase)
 */
function twilightColorMap(t: number): THREE.Color {
  const c0 = new THREE.Color(0.885400, 0.885400, 0.885400);
  const c1 = new THREE.Color(0.818366, 0.702410, 0.853180);
  const c2 = new THREE.Color(0.586966, 0.482436, 0.769874);
  const c3 = new THREE.Color(0.334898, 0.300235, 0.640233);
  const c4 = new THREE.Color(0.171646, 0.231529, 0.530886);
  const c5 = new THREE.Color(0.205626, 0.256126, 0.442271);
  const c6 = new THREE.Color(0.301021, 0.347062, 0.394891);
  const c7 = new THREE.Color(0.543630, 0.506470, 0.493550);
  const c8 = new THREE.Color(0.763053, 0.678913, 0.662722);
  const c9 = new THREE.Color(0.893564, 0.823950, 0.832687);
  const c10 = new THREE.Color(0.885400, 0.885400, 0.885400);

  const colors = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10];
  const idx = t * (colors.length - 1);
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, colors.length - 1);
  const frac = idx - i1;

  return new THREE.Color(
    colors[i1].r + (colors[i2].r - colors[i1].r) * frac,
    colors[i1].g + (colors[i2].g - colors[i1].g) * frac,
    colors[i1].b + (colors[i2].b - colors[i1].b) * frac
  );
}

/**
 * Get color for a normalized value using the specified color map
 * @param value Normalized value (0-1)
 * @param colorMap Color map name
 * @returns THREE.Color
 */
export function getColor(value: number, colorMap: ColorMapType = 'jet'): THREE.Color {
  // Clamp to [0, 1]
  const t = Math.max(0, Math.min(1, value));

  switch (colorMap) {
    case 'jet':
      return jetColorMap(t);
    case 'turbo':
      return turboColorMap(t);
    case 'viridis':
      return viridisColorMap(t);
    case 'plasma':
      return plasmaColorMap(t);
    case 'twilight':
      return twilightColorMap(t);
    default:
      return jetColorMap(t);
  }
}

/**
 * Create a color array for vertex colors in a BufferGeometry
 * @param values Array of scalar values
 * @param colorMap Color map name
 * @param minValue Minimum value for normalization (defaults to array min)
 * @param maxValue Maximum value for normalization (defaults to array max)
 * @returns Float32Array of RGB colors [r1, g1, b1, r2, g2, b2, ...]
 */
export function createColorArray(
  values: number[],
  colorMap: ColorMapType = 'jet',
  minValue?: number,
  maxValue?: number
): Float32Array {
  // Auto-compute min/max if not provided
  const min = minValue !== undefined ? minValue : Math.min(...values);
  const max = maxValue !== undefined ? maxValue : Math.max(...values);
  const range = max - min || 1; // Avoid division by zero

  const colors = new Float32Array(values.length * 3);
  
  for (let i = 0; i < values.length; i++) {
    const normalized = (values[i] - min) / range;
    const color = getColor(normalized, colorMap);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return colors;
}
