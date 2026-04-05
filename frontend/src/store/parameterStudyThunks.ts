/**
 * Parameter study engine — orchestrates multi-point solve loops.
 *
 * For each grid point the engine:
 *   1. Overrides sweep-variable values in the variable context
 *   2. Re-evaluates element geometry expressions
 *   3. Re-meshes elements whose geometry changed (skips if only `freq` changed)
 *   4. Builds a MultiAntennaRequest at the current frequency
 *   5. Calls the solver
 *   6. Collects the result
 *
 * The engine lives outside the solver slice so it can be tested and
 * composed independently.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type {
  ParameterStudyConfig,
  ParameterStudyResult,
  ParameterPointResult,
  GridPoint,
  MeshSnapshot,
} from '@/types/parameterStudy';
import { buildSweepGrid, needsRemesh } from '@/types/parameterStudy';
import type { MultiAntennaRequest } from '@/types/api';
import { solveMultiAntenna } from '@/api/solver';
import { convertElementToAntennaInput } from '@/utils/multiAntennaBuilder';
import { remeshElementExpressions } from '@/store/designSlice';
import { evaluateExpression } from '@/utils/expressionEvaluator';
import type { VariableDefinition } from '@/utils/expressionEvaluator';
import { setProgress, setSweepProgress, runMultiAntennaSimulation } from '@/store/solverSlice';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a numeric variable context by evaluating all variable definitions
 * with specific sweep-variable overrides applied.
 */
export function buildOverriddenContext(
  variables: VariableDefinition[],
  overrides: Record<string, number>,
): Record<string, number> {
  const ctx: Record<string, number> = {};
  for (const v of variables) {
    if (v.name in overrides) {
      ctx[v.name] = overrides[v.name];
    } else {
      try {
        ctx[v.name] = evaluateExpression(v.expression, ctx);
      } catch {
        // skip variables that fail to evaluate
      }
    }
  }
  return ctx;
}

/**
 * For an element with stored expressions, evaluate them against the
 * overridden variable context and return `{exprKey: numericValue}`.
 */
export function resolveElementExpressions(
  expressions: Record<string, string>,
  ctx: Record<string, number>,
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const [key, expr] of Object.entries(expressions)) {
    try {
      resolved[key] = evaluateExpression(expr, ctx);
    } catch {
      // leave unresolved keys out — the remesh will use the previous value
    }
  }
  return resolved;
}

// ============================================================================
// Async Thunk
// ============================================================================

export const runParameterStudy = createAsyncThunk<
  ParameterStudyResult,
  ParameterStudyConfig,
  { state: RootState }
>(
  'solver/runParameterStudy',
  async (config, { getState, dispatch, rejectWithValue }) => {
    const startTime = performance.now();

    try {
      // 1. Build the grid
      const gridPoints = buildSweepGrid(config);
      if (gridPoints.length === 0) {
        return rejectWithValue('No grid points generated');
      }

      const results: ParameterPointResult[] = [];
      let prevPoint: GridPoint | null = null;

      for (let i = 0; i < gridPoints.length; i++) {
        const point = gridPoints[i];

        // 2. Progress
        dispatch(setProgress(Math.round((i / gridPoints.length) * 100)));
        dispatch(setSweepProgress({ current: i + 1, total: gridPoints.length }));

        // 3. Build overridden variable context
        const state = getState();
        const variables = state.variables.variables;
        const ctx = buildOverriddenContext(variables, point.values);

        // 4. Remesh if geometry changed
        if (needsRemesh(prevPoint, point)) {
          const elements = state.design.elements;
          for (const element of elements) {
            if (!element.visible || element.locked) continue;
            if (element.expressions && Object.keys(element.expressions).length > 0) {
              const resolved = resolveElementExpressions(element.expressions, ctx);
              if (Object.keys(resolved).length > 0) {
                await dispatch(
                  remeshElementExpressions({
                    elementId: element.id,
                    resolvedValues: resolved,
                  }),
                ).unwrap();
              }
            }
          }
          // Yield to the event loop so React can repaint the updated geometry
          await new Promise((r) => setTimeout(r, 0));
        }

        // 5. Build solver request
        const freshState = getState();
        const elements = freshState.design.elements;
        const visibleElements = elements.filter(
          (el) =>
            el.visible &&
            !el.locked &&
            el.mesh &&
            el.mesh.nodes.length > 0 &&
            el.mesh.edges.length > 0,
        );
        const antennaInputs = visibleElements.map(convertElementToAntennaInput);

        if (antennaInputs.length === 0) {
          return rejectWithValue('No valid antenna elements for simulation');
        }

        // 5b. Capture mesh snapshot for postprocessing
        const meshSnapshots: MeshSnapshot[] = visibleElements.map((el) => ({
          nodes: el.mesh!.nodes.map((n) => [...n]),
          edges: el.mesh!.edges.map((e) => [...e] as [number, number]),
          radii: el.mesh!.radii ? [...el.mesh!.radii] : el.mesh!.edges.map(() => 0.001),
          sources: (el.sources ?? []).map((s) => ({
            type: s.type as string | undefined,
            node_start: s.node_start,
            node_end: s.node_end,
            amplitude: typeof s.amplitude === 'number' ? s.amplitude : undefined,
          })),
          position: el.position ? [...el.position] as [number, number, number] : [0, 0, 0],
        }));

        // Frequency from the context (the variable named `freq`)
        const frequency = ctx.freq;
        if (!frequency || frequency <= 0) {
          return rejectWithValue(
            `Invalid frequency at grid point ${i}: ${frequency}`,
          );
        }

        const request: MultiAntennaRequest = {
          frequency,
          antennas: antennaInputs,
        };

        // 6. Solve
        const solverResponse = await solveMultiAntenna(request);

        results.push({
          point,
          solverResponse,
          converged: solverResponse.converged,
          meshSnapshots,
        });

        prevPoint = point;
      }

      // Restore all expression-linked elements to the nominal variable context.
      // After the sweep the mesh may reflect the last swept geometry; bring it
      // back to the current user-set variable values so the 3D view is correct.
      const postSweepState = getState();
      const nominalCtx = buildOverriddenContext(postSweepState.variables.variables, {});
      for (const element of postSweepState.design.elements) {
        if (!element.visible || element.locked) continue;
        if (element.expressions && Object.keys(element.expressions).length > 0) {
          const resolved = resolveElementExpressions(element.expressions, nominalCtx);
          if (Object.keys(resolved).length > 0) {
            await dispatch(
              remeshElementExpressions({ elementId: element.id, resolvedValues: resolved }),
            ).unwrap();
          }
        }
      }

      // 7. Final nominal solve — populate state.results / state.multiAntennaResults
      //    so that postprocessing (field computation, directivity) can work after a sweep.
      const nominalFrequency = nominalCtx.freq;
      if (nominalFrequency && nominalFrequency > 0) {
        const finalState = getState();
        const nominalInputs = finalState.design.elements
          .filter(
            (el) =>
              el.visible &&
              !el.locked &&
              el.mesh &&
              el.mesh.nodes.length > 0 &&
              el.mesh.edges.length > 0,
          )
          .map(convertElementToAntennaInput);

        if (nominalInputs.length > 0) {
          await dispatch(
            runMultiAntennaSimulation({ frequency: nominalFrequency, antennas: nominalInputs }),
          ).unwrap();
        }
      }

      // 8. Final progress
      dispatch(setProgress(100));

      return {
        config,
        gridPoints,
        results,
        totalTimeMs: performance.now() - startTime,
      };
    } catch (error: any) {
      return rejectWithValue(
        error?.message || 'Parameter study failed',
      );
    }
  },
);
