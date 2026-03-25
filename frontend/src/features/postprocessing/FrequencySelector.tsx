import React from 'react';
import { Box, Slider, Typography } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectFrequencySweep,
  selectSelectedFrequencyHz,
  setSelectedFrequency,
} from '@/store/solverSlice';

// ============================================================================
// Pure helpers (exported for testing)
// ============================================================================

/** Format a frequency in Hz as a MHz string with 2 decimals */
export function formatFrequencyMHz(freqHz: number): string {
  return (freqHz / 1e6).toFixed(2);
}

/** Build MUI Slider marks from a Hz frequency array (values in MHz for the slider) */
export function getFrequencyMarks(
  frequenciesHz: number[],
): Array<{ value: number; label: string }> {
  return frequenciesHz.map((f) => ({ value: f / 1e6, label: '' }));
}

/**
 * Given a slider value in MHz, snap to the nearest frequency in the Hz array.
 * Returns the frequency in Hz.
 */
export function snapToNearestFrequency(
  valueMHz: number,
  frequenciesHz: number[],
): number {
  if (frequenciesHz.length === 0) return 0;
  let closest = frequenciesHz[0];
  let minDist = Math.abs(valueMHz - closest / 1e6);
  for (let i = 1; i < frequenciesHz.length; i++) {
    const dist = Math.abs(valueMHz - frequenciesHz[i] / 1e6);
    if (dist < minDist) {
      minDist = dist;
      closest = frequenciesHz[i];
    }
  }
  return closest;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Global frequency selector for postprocessing.
 * Shown in the PostprocessingTab left panel when sweep results are available.
 * Dispatches `setSelectedFrequency` to update the global selected frequency.
 */
export const FrequencySelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const frequencySweep = useAppSelector(selectFrequencySweep);
  const selectedFrequencyHz = useAppSelector(selectSelectedFrequencyHz);

  if (!frequencySweep || !frequencySweep.frequencies || frequencySweep.frequencies.length <= 1) {
    return null; // Only show for multi-frequency sweeps
  }

  const frequencies = frequencySweep.frequencies;
  const marks = getFrequencyMarks(frequencies);
  const minMHz = Math.min(...frequencies) / 1e6;
  const maxMHz = Math.max(...frequencies) / 1e6;
  const currentMHz = selectedFrequencyHz ? selectedFrequencyHz / 1e6 : minMHz;

  const handleChange = (_event: Event, value: number | number[]) => {
    const mhz = value as number;
    const snappedHz = snapToNearestFrequency(mhz, frequencies);
    dispatch(setSelectedFrequency(snappedHz));
  };

  return (
    <Box sx={{ px: 2, pt: 1.5, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Frequency
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
        {formatFrequencyMHz(selectedFrequencyHz ?? frequencies[0])} MHz
      </Typography>
      <Slider
        value={currentMHz}
        onChange={handleChange}
        min={minMHz}
        max={maxMHz}
        step={null}
        marks={marks}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => `${v.toFixed(2)} MHz`}
        size="small"
        sx={{ mt: 0 }}
      />
    </Box>
  );
};

export default FrequencySelector;
