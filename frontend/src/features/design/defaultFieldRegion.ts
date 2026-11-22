import * as THREE from 'three';
import type { AntennaElement } from '@/types/models';

const C0 = 299_792_458;

/** Starting values for a new field region (all lengths in mm, as in AddFieldDialog). */
export interface FieldRegionDefaults {
  center: { x: number; y: number; z: number };
  /** Side length of a plane/cuboid, diameter of an ellipse/sphere, length of a line */
  size: number;
  preset: 'XY' | 'YZ' | 'XZ';
}

/** Fallback when there is neither geometry nor a frequency (the old fixed default). */
export const FALLBACK_FIELD_DEFAULTS: FieldRegionDefaults = {
  center: { x: 0, y: 0, z: 0 },
  size: 100,
  preset: 'XY',
};

/** Smallest 1 / 2 / 2.5 / 5 × 10^k that is ≥ v (keeps the dialog's numbers readable). */
export function niceCeil(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const k = Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const n = m * 10 ** k;
    if (n >= v * (1 - 1e-12)) return Number(n.toPrecision(12));
  }
  return 10 ** (k + 1);
}

/**
 * Default field region: a plane through the antenna about one wavelength across,
 * so the near field and the start of the radiating field are both visible.
 *
 * - size = λ, clamped to 2–10 × the antenna's largest extent (a λ/2 dipole gets λ;
 *   an electrically small loop gets 10 × its diameter instead of a mostly empty
 *   plane many metres wide); rounded up to a readable number
 * - XZ plane (contains a z-directed dipole and the x axis), YZ if the antenna
 *   is longest along y
 * - centred on the antenna's bounding box
 */
export function defaultFieldRegion(
  elements: readonly AntennaElement[],
  frequencyMHz: number | null | undefined,
): FieldRegionDefaults {
  const box = new THREE.Box3();
  const euler = new THREE.Euler();
  const v = new THREE.Vector3();
  for (const el of elements) {
    if (el.visible === false || !el.mesh?.nodes) continue;
    const rot = el.rotation ?? [0, 0, 0];
    const pos = el.position ?? [0, 0, 0];
    euler.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2]),
      'XYZ',
    );
    // Same transform as WireGeometry (rotation in degrees, then position)
    const offset = new THREE.Vector3(pos[0], pos[1], pos[2]);
    for (const n of el.mesh.nodes) {
      if (!n || n.length < 3) continue;
      v.set(n[0], n[1], n[2]).applyEuler(euler).add(offset);
      box.expandByPoint(v);
    }
  }

  const lambdaMm = frequencyMHz && frequencyMHz > 0 ? (C0 / (frequencyMHz * 1e6)) * 1000 : 0;
  if (box.isEmpty()) {
    return lambdaMm > 0 ? { ...FALLBACK_FIELD_DEFAULTS, size: niceCeil(lambdaMm), preset: 'XZ' } : FALLBACK_FIELD_DEFAULTS;
  }

  const sizeM = box.getSize(new THREE.Vector3());
  const extentMm = Math.max(sizeM.x, sizeM.y, sizeM.z) * 1000;
  let size: number;
  if (lambdaMm > 0 && extentMm > 0) size = Math.min(Math.max(lambdaMm, 2 * extentMm), 10 * extentMm);
  else if (extentMm > 0) size = 2 * extentMm;
  else size = lambdaMm || FALLBACK_FIELD_DEFAULTS.size;

  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(1000);
  const round = (x: number) => Math.round(x * 10) / 10 + 0; // 0.1 mm, no -0
  return {
    center: { x: round(c.x), y: round(c.y), z: round(c.z) },
    size: niceCeil(size),
    preset: sizeM.y > Math.max(sizeM.x, sizeM.z) ? 'YZ' : 'XZ',
  };
}
