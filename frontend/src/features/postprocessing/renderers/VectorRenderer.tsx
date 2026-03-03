import React, { useMemo, useEffect, useRef } from 'react';
import { ViewItem, DisplayQuantity } from '../../../types/postprocessing';
import { useAppSelector } from '../../../store/hooks';
import { ArrowHelper } from 'three';
import { createColorArray, arrayMin, arrayMax } from '../../../utils/colorMaps';
import { computeInstantaneousVectors } from '../../../utils/timeAnimation';
import * as THREE from 'three';

/** Dispose an ArrowHelper's internal GPU resources (geometries + materials). */
function disposeArrowHelper(obj: THREE.Object3D) {
  if (obj instanceof ArrowHelper) {
    obj.line.geometry.dispose();
    (obj.line.material as THREE.Material).dispose();
    obj.cone.geometry.dispose();
    (obj.cone.material as THREE.Material).dispose();
  }
}

interface ComplexComponent {
  real: number;
  imag: number;
}

interface ComplexVector3D {
  x: ComplexComponent;
  y: ComplexComponent;
  z: ComplexComponent;
}

/**
 * Seeded pseudo-random number generator (Linear Congruential Generator).
 * Returns a function that generates numbers in [0, 1).
 */
export function createSeededRandom(initialSeed: number): () => number {
  let seed = initialSeed;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Generate a set of random indices for arrow display.
 * Uses seeded pseudo-random for deterministic, stable visualization.
 */
export function generateRandomIndices(
  totalPoints: number,
  count: number,
  seed: number
): Set<number> {
  const actualCount = Math.min(count, totalPoints);
  const indices = new Set<number>();
  const pseudoRandom = createSeededRandom(seed);
  while (indices.size < actualCount) {
    indices.add(Math.floor(pseudoRandom() * totalPoints));
  }
  return indices;
}

/**
 * Compute time-averaged Poynting vectors S = 0.5 * Re(E × H*).
 * Returns real-valued [Sx, Sy, Sz] for each point.
 */
export function computePoyntingVectors(
  E_vectors: ComplexVector3D[],
  H_vectors: ComplexVector3D[],
): Array<{ x: number; y: number; z: number; mag: number }> {
  const n = Math.min(E_vectors.length, H_vectors.length);
  const result = new Array<{ x: number; y: number; z: number; mag: number }>(n);
  for (let i = 0; i < n; i++) {
    const E = E_vectors[i];
    const H = H_vectors[i];
    // Cross product E × H* (complex): S = 0.5 * Re(E × H*)
    // Re(E × H*)_x = Re(Ey * Hz*) - Re(Ez * Hy*)
    // Re(A * B*) = A.real * B.real + A.imag * B.imag
    const Sx = 0.5 * (
      (E.y.real * H.z.real + E.y.imag * H.z.imag) -
      (E.z.real * H.y.real + E.z.imag * H.y.imag)
    );
    const Sy = 0.5 * (
      (E.z.real * H.x.real + E.z.imag * H.x.imag) -
      (E.x.real * H.z.real + E.x.imag * H.z.imag)
    );
    const Sz = 0.5 * (
      (E.x.real * H.y.real + E.x.imag * H.y.imag) -
      (E.y.real * H.x.real + E.y.imag * H.x.imag)
    );
    result[i] = { x: Sx, y: Sy, z: Sz, mag: Math.sqrt(Sx * Sx + Sy * Sy + Sz * Sz) };
  }
  return result;
}

interface VectorRendererProps {
  item: ViewItem;
  frequencyHz?: number;
  /** Current animation phase in radians [0, 2π). When provided and item.animationEnabled,
   *  renders the instantaneous field at this phase instead of static real/imag/magnitude. */
  animationPhase?: number;
}

/**
 * Renders field-vector and field-vector-component items as arrow helpers.
 * Uses color mapping for vector magnitudes and arrow size control.
 * Supports E-field, H-field (with phase animation) and Poynting vector (time-averaged).
 */
export const VectorRenderer: React.FC<VectorRendererProps> = ({
  item,
  frequencyHz,
  animationPhase,
}) => {
  const fieldData = useAppSelector((state) => state.solver.fieldData);
  const requestedFields = useAppSelector((state) => state.solver.requestedFields);

  // Find the field definition for this item
  const fieldId = item.fieldId;
  const field = fieldId ? requestedFields?.find((f) => f.id === fieldId) : requestedFields?.[0];
  const fieldType = field?.fieldType;

  // Get field data for this frequency (safe access before early return)
  // Use String() fallback for defensive key lookup — after JSON round-trip, object keys are always strings
  const dataForFrequency = (field && fieldData && frequencyHz)
    ? (fieldData[field.id]?.[frequencyHz] ?? fieldData[field.id]?.[String(frequencyHz)])
    : undefined;

  // For Poynting, compute real-valued vectors; for E/H, use complex vectors
  const isPoynting = fieldType === 'poynting';

  // Compute Poynting vectors if needed
  const poyntingVectors = useMemo(() => {
    if (!isPoynting || !dataForFrequency?.E_vectors || !dataForFrequency?.H_vectors) return null;
    return computePoyntingVectors(dataForFrequency.E_vectors, dataForFrequency.H_vectors);
  }, [isPoynting, dataForFrequency?.E_vectors, dataForFrequency?.H_vectors]);

  // Determine which vectors to use (E, H, or computed Poynting)
  const complexVectors = dataForFrequency
    ? (fieldType === 'H' ? dataForFrequency.H_vectors : dataForFrequency.E_vectors)
    : undefined;
  const magnitudes = dataForFrequency
    ? (fieldType === 'H' ? dataForFrequency.H_mag : dataForFrequency.E_mag)
    : undefined;

  // Get visualization properties
  const colorMap = item.colorMap || 'jet';
  const opacity = item.opacity !== undefined ? item.opacity : 0.9;
  // Default arrow size scaled to typical problem dimension (field region ~0.1m => 0.01m arrow base)
  const arrowSize = item.arrowSize ?? 0.01;
  const arrowDensity = Math.max(1, Math.round(item.arrowDensity || 1)); // Show every Nth arrow
  const arrowDisplayMode = item.arrowDisplayMode || 'every-nth';
  const randomArrowCount = item.randomArrowCount || 50;
  const arrowScalingMode = item.arrowScalingMode || 'magnitude';
  const valueRangeMode = item.valueRangeMode || 'auto';

  // Derive vectorComplexPart and animation flag from unified displayQuantity
  const displayQuantity: DisplayQuantity = item.displayQuantity || 'magnitude';
  const vectorComplexPart = displayQuantity === 'real' ? 'real'
    : displayQuantity === 'imaginary' ? 'imaginary'
    : 'magnitude';

  // Animation mode: use instantaneous field at the given phase
  const isAnimating = displayQuantity === 'instantaneous' && animationPhase !== undefined && !isPoynting;

  // Generate random indices for random arrow mode
  const randomIndices = useMemo(() => {
    if (arrowDisplayMode !== 'random' || !dataForFrequency) return null;
    const totalPoints = dataForFrequency.points.length;
    // Use seeded random for stable visualization (based on field id)
    const seed = item.fieldId ? item.fieldId.charCodeAt(0) : 42;
    return generateRandomIndices(totalPoints, randomArrowCount, seed);
  }, [arrowDisplayMode, randomArrowCount, dataForFrequency?.points.length, item.fieldId]);

  // Peak magnitudes (phase-independent) — used for color mapping and auto range
  // These represent the maximum possible magnitude at each point over all phases
  const peakMagnitudes = useMemo(() => {
    if (isPoynting && poyntingVectors) {
      return poyntingVectors.map(v => v.mag);
    }
    // For E/H: use the original peak magnitudes (|V| = sqrt(Vr² + Vi²) per component)
    if (magnitudes && magnitudes.length > 0) return magnitudes;
    // Fallback: compute from complex vectors
    if (!complexVectors) return undefined;
    return complexVectors.map((v) => {
      const mx = Math.sqrt(v.x.real * v.x.real + v.x.imag * v.x.imag);
      const my = Math.sqrt(v.y.real * v.y.real + v.y.imag * v.y.imag);
      const mz = Math.sqrt(v.z.real * v.z.real + v.z.imag * v.z.imag);
      return Math.sqrt(mx * mx + my * my + mz * mz);
    });
  }, [isPoynting, poyntingVectors, magnitudes, complexVectors]);

  // Instantaneous vectors computed at the animation phase
  const instantaneousVectors = useMemo(() => {
    if (!isAnimating || !complexVectors) return null;
    return computeInstantaneousVectors(complexVectors, animationPhase!);
  }, [isAnimating, complexVectors, animationPhase]);

  // Display magnitudes — based on selected complex part (real, imaginary, or peak magnitude)
  const displayMagnitudes = useMemo(() => {
    if (isPoynting && poyntingVectors) {
      // Poynting: always time-averaged, complex part selection doesn't apply
      return poyntingVectors.map(v => v.mag);
    }
    // Animation mode: use instantaneous magnitudes
    if (isAnimating && instantaneousVectors) {
      return instantaneousVectors.map(v => v.magnitude);
    }
    if (!complexVectors) return magnitudes;
    if (vectorComplexPart === 'real') {
      return complexVectors.map((v) => {
        return Math.sqrt(v.x.real * v.x.real + v.y.real * v.y.real + v.z.real * v.z.real);
      });
    }
    if (vectorComplexPart === 'imaginary') {
      return complexVectors.map((v) => {
        return Math.sqrt(v.x.imag * v.x.imag + v.y.imag * v.y.imag + v.z.imag * v.z.imag);
      });
    }
    // 'magnitude': use peak magnitudes
    return peakMagnitudes;
  }, [isPoynting, poyntingVectors, complexVectors, magnitudes, peakMagnitudes, vectorComplexPart, isAnimating, instantaneousVectors]);

  // Calculate value range
  // During animation, use peak magnitudes for a stable color range across all phases
  const rangeMagnitudes = isAnimating ? peakMagnitudes : displayMagnitudes;
  const min = (rangeMagnitudes && rangeMagnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? (item.valueRangeMin ?? 0) : arrayMin(rangeMagnitudes))
    : 0;
  const max = (rangeMagnitudes && rangeMagnitudes.length > 0)
    ? (valueRangeMode === 'manual' ? (item.valueRangeMax ?? 1) : arrayMax(rangeMagnitudes))
    : 1;

  // Create colors from display magnitudes
  const colors = useMemo(() => {
    if (!displayMagnitudes) return new Float32Array(0);
    return createColorArray(displayMagnitudes, colorMap as any, min, max);
  }, [displayMagnitudes, colorMap, min, max]);

  // Create arrow helpers
  const arrows = useMemo(() => {
    if (!dataForFrequency || !displayMagnitudes || !peakMagnitudes) return [];

    // Helper to check if index should be rendered
    const shouldRenderIndex = (index: number): boolean => {
      if (arrowDisplayMode === 'random' && randomIndices) {
        return randomIndices.has(index);
      }
      // every-nth mode
      return index % arrowDensity === 0;
    };

    const isUniform = arrowScalingMode === 'uniform';

    // For Poynting: use pre-computed real vectors
    if (isPoynting && poyntingVectors) {
      return dataForFrequency.points.map((point, index) => {
        // Skip arrows based on display mode
        if (!shouldRenderIndex(index)) return null;
        if (index >= poyntingVectors.length) return null;

        const S = poyntingVectors[index];
        const magnitude = S.mag;

        // Poynting direction is the real-valued S vector
        const direction = new THREE.Vector3(S.x, S.y, S.z);
        const length = direction.length();
        if (length === 0) return null;
        direction.normalize();

        // Get color for this arrow (from peak magnitudes)
        const color = new THREE.Color(
          colors[index * 3],
          colors[index * 3 + 1],
          colors[index * 3 + 2]
        );

        // Scale arrow length
        let arrowLength: number;
        if (isUniform) {
          arrowLength = arrowSize;
        } else {
          const normalizedMagnitude = max > min ? (magnitude - min) / (max - min) : 0.5;
          arrowLength = arrowSize * normalizedMagnitude;
        }

        return {
          origin: new THREE.Vector3(point[0], point[1], point[2]),
          direction,
          length: arrowLength,
          color,
        };
      }).filter(Boolean);
    }

    // For E/H fields: use complex vectors with selected complex part
    if (!complexVectors) return [];
    return dataForFrequency.points.map((point, index) => {
      // Skip arrows based on display mode
      if (!shouldRenderIndex(index)) return null;
      if (index >= complexVectors.length) return null;

      const vector = complexVectors[index];
      const dispMag = displayMagnitudes[index];

      // Compute direction based on animation mode or selected complex part
      let direction: THREE.Vector3;
      if (isAnimating && instantaneousVectors && index < instantaneousVectors.length) {
        // Animation mode: use instantaneous direction
        const inst = instantaneousVectors[index];
        direction = new THREE.Vector3(inst.x, inst.y, inst.z);
      } else if (vectorComplexPart === 'real') {
        direction = new THREE.Vector3(vector.x.real, vector.y.real, vector.z.real);
      } else if (vectorComplexPart === 'imaginary') {
        direction = new THREE.Vector3(vector.x.imag, vector.y.imag, vector.z.imag);
      } else {
        // 'magnitude': use real part as default direction (peak has no inherent direction)
        direction = new THREE.Vector3(vector.x.real, vector.y.real, vector.z.real);
      }

      // Normalize direction
      const length = direction.length();
      if (length === 0) return null;
      direction.normalize();

      // Get color for this arrow
      const color = new THREE.Color(
        colors[index * 3],
        colors[index * 3 + 1],
        colors[index * 3 + 2]
      );

      // Scale arrow length using display magnitude
      let arrowLength: number;
      if (isUniform) {
        arrowLength = arrowSize;
      } else {
        const normalizedMagnitude = max > min ? (dispMag - min) / (max - min) : 0.5;
        arrowLength = arrowSize * Math.max(0, normalizedMagnitude);
      }

      return {
        origin: new THREE.Vector3(point[0], point[1], point[2]),
        direction,
        length: arrowLength,
        color,
      };
    }).filter(Boolean);
  }, [dataForFrequency?.points, complexVectors, displayMagnitudes, peakMagnitudes, poyntingVectors, colors, arrowSize, arrowDensity, arrowDisplayMode, arrowScalingMode, randomIndices, min, max, vectorComplexPart, isPoynting, isAnimating, instantaneousVectors]);

  // Check if we have valid data to render
  const hasData = isPoynting
    ? (poyntingVectors && poyntingVectors.length > 0)
    : (complexVectors && peakMagnitudes && peakMagnitudes.length > 0);

  // Imperative arrow management — create ArrowHelpers in a group and dispose old
  // ones on every update to prevent GPU memory leaks during animation.
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clear and dispose old arrows
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeArrowHelper(child);
    }

    // Only create new arrows when we have valid data
    if (!field || !fieldData || !frequencyHz || !dataForFrequency || !hasData) return;

    for (const arrow of arrows) {
      if (!arrow) continue;
      const helper = new ArrowHelper(
        arrow.direction,
        arrow.origin,
        arrow.length,
        arrow.color,
        arrow.length * 0.2, // Head length (20% of total)
        arrow.length * 0.1  // Head width (10% of total)
      );
      if (opacity < 1.0) {
        (helper.cone.material as THREE.MeshBasicMaterial).transparent = true;
        (helper.cone.material as THREE.MeshBasicMaterial).opacity = opacity;
        (helper.line.material as THREE.LineBasicMaterial).transparent = true;
        (helper.line.material as THREE.LineBasicMaterial).opacity = opacity;
      }
      group.add(helper);
    }

    return () => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        disposeArrowHelper(child);
      }
    };
  }, [arrows, opacity, hasData, field, fieldData, frequencyHz, dataForFrequency]);

  return <group ref={groupRef} />;
};
