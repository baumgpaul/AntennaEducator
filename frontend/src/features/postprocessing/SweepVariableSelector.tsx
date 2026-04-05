/**
 * SweepVariableSelector — slider(s) for navigating parameter study results.
 *
 * Shows one slider per swept variable.  When the slider changes, dispatches
 * `setSweepPointIndex` to update the active sweep point and (optionally)
 * re-meshes the geometry so the 3D view matches the swept values.
 */
import React, { useMemo, useCallback } from 'react';
import { Box, Slider, Typography } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectParameterStudy,
  selectSweepPointIndex,
  setSweepPointIndex,
  setSelectedFrequency,
} from '@/store/solverSlice';
import { applySweepMeshSnapshots } from '@/store/designSlice';
import {
  generateSweepValues,
} from '@/types/parameterStudy';
import type { SweepVariable } from '@/types/parameterStudy';

// ============================================================================
// Pure helpers (exported for testing)
// ============================================================================

/** Given per-variable slider indices, find the flat grid index. */
export function indicesToFlatIndex(
  indices: number[],
  sweepVars: SweepVariable[],
): number {
  if (sweepVars.length === 1) return indices[0] ?? 0;
  const innerLen = sweepVars[1].numPoints;
  return (indices[0] ?? 0) * innerLen + (indices[1] ?? 0);
}

/** Given a flat grid index, recover per-variable indices. */
export function flatIndexToIndices(
  flatIndex: number,
  sweepVars: SweepVariable[],
): number[] {
  if (sweepVars.length === 1) return [flatIndex];
  const innerLen = sweepVars[1].numPoints;
  return [Math.floor(flatIndex / innerLen), flatIndex % innerLen];
}

// ============================================================================
// Component
// ============================================================================

export const SweepVariableSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const study = useAppSelector(selectParameterStudy);
  const sweepPointIndex = useAppSelector(selectSweepPointIndex);

  // Compute per-variable sweep values
  const sweepAxes = useMemo(() => {
    if (!study) return [];
    return study.config.sweepVariables.map((sv) => ({
      variable: sv,
      values: generateSweepValues(sv),
    }));
  }, [study]);

  // Current per-variable indices derived from the flat index
  const currentIndices = useMemo(() => {
    if (!study) return [];
    return flatIndexToIndices(sweepPointIndex, study.config.sweepVariables);
  }, [sweepPointIndex, study]);

  // Handler: when a slider for variable `varIdx` changes to value-index `newValueIdx`
  const handleSliderChange = useCallback(
    (varIdx: number, newValueIdx: number) => {
      if (!study) return;
      const newIndices = [...currentIndices];
      newIndices[varIdx] = newValueIdx;
      const flatIdx = indicesToFlatIndex(newIndices, study.config.sweepVariables);
      // Clamp to valid range
      const clampedIdx = Math.max(0, Math.min(flatIdx, study.gridPoints.length - 1));
      dispatch(setSweepPointIndex(clampedIdx));

      // Also update selectedFrequency from the sweep point's solver response
      // so backward-compat consumers (port quantities strip, etc.) see the right freq
      const ptResult = study.results[clampedIdx];
      if (ptResult?.solverResponse) {
        const freq = (ptResult.solverResponse as { frequency?: number }).frequency;
        if (freq) dispatch(setSelectedFrequency(freq));
      }

      // Use precomputed mesh snapshots from the sweep point. This keeps
      // navigation local/offline and avoids API remesh calls while browsing.
      if (ptResult?.meshSnapshots && ptResult.meshSnapshots.length > 0) {
        dispatch(applySweepMeshSnapshots({ meshSnapshots: ptResult.meshSnapshots }));
      }
    },
    [dispatch, study, currentIndices],
  );

  if (!study || sweepAxes.length === 0) return null;

  return (
    <Box sx={{ px: 2, pt: 1.5, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Parameter Sweep
      </Typography>
      {sweepAxes.map((axis, varIdx) => {
        const idx = currentIndices[varIdx] ?? 0;
        const currentVal = axis.values[idx] ?? axis.values[0];
        const marks = axis.values.map((_, i) => ({ value: i, label: '' }));

        return (
          <Box key={axis.variable.variableName} sx={{ mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
              {axis.variable.variableName} = {formatValue(currentVal)}
            </Typography>
            <Slider
              value={idx}
              onChange={(_e, v) => handleSliderChange(varIdx, v as number)}
              min={0}
              max={axis.values.length - 1}
              step={1}
              marks={marks}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatValue(axis.values[v] ?? 0)}
              size="small"
              sx={{ mt: 0 }}
            />
          </Box>
        );
      })}
    </Box>
  );
};

/** Format a numeric value for display (compact scientific for very small/large). */
function formatValue(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 0.01) return v.toPrecision(4);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

export default SweepVariableSelector;
