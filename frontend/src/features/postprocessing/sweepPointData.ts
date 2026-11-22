/**
 * What postprocessing shows for the selected solution: in a parameter sweep the
 * currents, voltages AND geometry belong to the selected sweep point, not to the
 * nominal design. Renderers, colour scales and the 3D scene all read through here
 * so they can never disagree (the colour scale used the nominal solve and the
 * scene the nominal geometry while the currents came from a re-meshed point).
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type { AntennaElement } from '@/types/models';
import type { MeshSnapshot, ParameterStudyResult } from '@/types/parameterStudy';

type SolutionField = 'branch_currents' | 'node_voltages';

interface SolutionSources {
  results: unknown;
  frequencySweep: { frequencies?: number[]; results?: unknown[] } | null | undefined;
  parameterStudy: ParameterStudyResult | null | undefined;
}

function flatten(resp: unknown, field: SolutionField): unknown[] | null {
  const sols = (resp as { antenna_solutions?: Record<string, unknown>[] } | null)?.antenna_solutions;
  if (!sols?.length) return null;
  return sols.flatMap((sol) => (sol[field] as unknown[] | undefined) ?? []);
}

/**
 * Branch currents / node voltages for `key`: a sweep point index in a parameter
 * study, a frequency (Hz) in a frequency sweep, otherwise the single solve.
 */
export function solutionValuesAt(
  key: number | null | undefined,
  field: SolutionField,
  { results, frequencySweep, parameterStudy }: SolutionSources,
): unknown[] | null {
  if (key == null) return null;

  if (parameterStudy?.results?.length) {
    const point = parameterStudy.results[Math.round(key)];
    const values = point ? flatten(point.solverResponse, field) : null;
    if (values) return values;
  }

  if (frequencySweep?.frequencies && frequencySweep.results) {
    const idx = frequencySweep.frequencies.findIndex((f) => Math.abs(f - key) < 1);
    const values = idx >= 0 ? flatten(frequencySweep.results[idx], field) : null;
    if (values) return values;
  }

  const direct = (results as Record<string, unknown> | null)?.[field] as unknown[] | undefined;
  if (direct) return direct;
  return flatten(results, field);
}

/**
 * Elements with each snapshot's mesh (and position) in place of the design mesh.
 * Matched by element id; old snapshots without ids map onto the visible, unlocked
 * elements in order (the elements the sweep solved). Never mutates the input.
 */
export function overlaySweepSnapshots(
  elements: readonly AntennaElement[],
  snapshots: readonly MeshSnapshot[] | undefined,
): AntennaElement[] {
  if (!snapshots?.length) return elements as AntennaElement[];
  const byId = new Map<string, MeshSnapshot>();
  const hasIds = snapshots.some((s) => s.elementId);
  if (hasIds) {
    for (const s of snapshots) if (s.elementId) byId.set(s.elementId, s);
  } else {
    let i = 0;
    for (const el of elements) {
      if (el.visible && !el.locked && i < snapshots.length) byId.set(el.id, snapshots[i++]);
    }
  }
  return elements.map((el) => {
    const snap = byId.get(el.id);
    if (!snap) return el;
    return {
      ...el,
      mesh: {
        ...el.mesh,
        nodes: snap.nodes.map((n) => [n[0], n[1], n[2]] as [number, number, number]),
        edges: snap.edges.map((e) => [e[0], e[1]] as [number, number]),
        radii: [...snap.radii],
      },
      position: snap.position?.length === 3 ? ([...snap.position] as [number, number, number]) : el.position,
    };
  });
}

/** Geometry to draw in postprocessing: the selected sweep point's meshes in sweep mode. */
export const selectDisplayElements = createSelector(
  [
    (s: RootState) => s.design.elements,
    (s: RootState) => s.solver.solveMode,
    (s: RootState) => s.solver.parameterStudy,
    (s: RootState) => s.solver.selectedSweepPointIndex,
  ],
  (elements, solveMode, study, pointIndex) => {
    if (solveMode !== 'sweep' || !study?.results?.length) return elements;
    return overlaySweepSnapshots(elements, study.results[pointIndex ?? 0]?.meshSnapshots);
  },
);
