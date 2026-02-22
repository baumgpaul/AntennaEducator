/**
 * ValueRangeInput — Reusable min/max range input with auto/manual toggle.
 *
 * Features:
 * - Accepts both '.' and ',' as decimal separators
 * - Supports scientific notation (e.g. 1.2e-5)
 * - Validates min < max (shows error state when min >= max)
 * - When switching to manual, defaults to auto-computed range
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { parseDecimalNumber, isValidNumericInput } from '../../utils/numberParser';

interface ValueRangeInputProps {
  /** Current range mode */
  mode: 'auto' | 'manual';
  /** Current manual min value */
  min: number;
  /** Current manual max value */
  max: number;
  /** Auto-computed min value (used as default when switching to manual) */
  autoMin?: number;
  /** Auto-computed max value (used as default when switching to manual) */
  autoMax?: number;
  /** Previously saved manual min (restored when switching back to manual) */
  savedManualMin?: number;
  /** Previously saved manual max (restored when switching back to manual) */
  savedManualMax?: number;
  /** Label prefix for Min/Max fields (e.g. ' (dBi)') */
  labelSuffix?: string;
  /** Label for the section */
  label?: string;
  /** Called when mode changes */
  onModeChange: (mode: 'auto' | 'manual') => void;
  /** Called when min value changes (only valid numbers) */
  onMinChange: (value: number) => void;
  /** Called when max value changes (only valid numbers) */
  onMaxChange: (value: number) => void;
  /** Called to save manual values when switching to auto */
  onSaveManualRange?: (min: number, max: number) => void;
}

const ValueRangeInput: React.FC<ValueRangeInputProps> = ({
  mode,
  min,
  max,
  autoMin,
  autoMax,
  savedManualMin,
  savedManualMax,
  labelSuffix = '',
  label = 'Value Range',
  onModeChange,
  onMinChange,
  onMaxChange,
  onSaveManualRange,
}) => {
  // Local text state for controlled input (allows intermediate states like "1." or "1e")
  const [minText, setMinText] = useState(String(min));
  const [maxText, setMaxText] = useState(String(max));

  // Sync local text when external values change (e.g. on undo, or mode switch defaults)
  useEffect(() => {
    setMinText(formatForDisplay(min));
  }, [min]);

  useEffect(() => {
    setMaxText(formatForDisplay(max));
  }, [max]);

  const handleModeChange = useCallback((_: React.MouseEvent, value: string | null) => {
    if (!value) return;
    const newMode = value as 'auto' | 'manual';

    if (newMode === 'manual' && mode === 'auto') {
      // Switching to manual: restore saved values if available, otherwise use auto range
      const restoredMin = savedManualMin ?? autoMin ?? 0;
      const restoredMax = savedManualMax ?? autoMax ?? 1;
      onMinChange(restoredMin);
      onMaxChange(restoredMax);
      setMinText(formatForDisplay(restoredMin));
      setMaxText(formatForDisplay(restoredMax));
    } else if (newMode === 'auto' && mode === 'manual') {
      // Switching to auto: save current manual values for later restoration
      if (onSaveManualRange) {
        onSaveManualRange(min, max);
      }
    }

    onModeChange(newMode);
  }, [mode, autoMin, autoMax, savedManualMin, savedManualMax, min, max, onModeChange, onMinChange, onMaxChange, onSaveManualRange]);

  const handleMinTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (isValidNumericInput(text)) {
      setMinText(text);
      const parsed = parseDecimalNumber(text);
      if (!isNaN(parsed) && isFinite(parsed)) {
        onMinChange(parsed);
      }
    }
  }, [onMinChange]);

  const handleMaxTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (isValidNumericInput(text)) {
      setMaxText(text);
      const parsed = parseDecimalNumber(text);
      if (!isNaN(parsed) && isFinite(parsed)) {
        onMaxChange(parsed);
      }
    }
  }, [onMaxChange]);

  // On blur, normalize the display text
  const handleMinBlur = useCallback(() => {
    const parsed = parseDecimalNumber(minText);
    if (!isNaN(parsed) && isFinite(parsed)) {
      setMinText(formatForDisplay(parsed));
      onMinChange(parsed);
    } else {
      // Revert to last valid value
      setMinText(formatForDisplay(min));
    }
  }, [minText, min, onMinChange]);

  const handleMaxBlur = useCallback(() => {
    const parsed = parseDecimalNumber(maxText);
    if (!isNaN(parsed) && isFinite(parsed)) {
      setMaxText(formatForDisplay(parsed));
      onMaxChange(parsed);
    } else {
      setMaxText(formatForDisplay(max));
    }
  }, [maxText, max, onMaxChange]);

  const hasError = mode === 'manual' && min >= max;

  return (
    <>
      {/* Mode Toggle */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          {label}{labelSuffix ? ` ${labelSuffix}` : ''}
        </Typography>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          size="small"
          fullWidth
        >
          <ToggleButton value="auto">Auto</ToggleButton>
          <ToggleButton value="manual">Manual</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Manual Range Inputs */}
      {mode === 'manual' && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            label={`Min${labelSuffix}`}
            type="text"
            inputMode="decimal"
            value={minText}
            onChange={handleMinTextChange}
            onBlur={handleMinBlur}
            error={hasError}
            helperText={hasError ? 'Min ≥ Max' : undefined}
            size="small"
            fullWidth
          />
          <TextField
            label={`Max${labelSuffix}`}
            type="text"
            inputMode="decimal"
            value={maxText}
            onChange={handleMaxTextChange}
            onBlur={handleMaxBlur}
            error={hasError}
            helperText={hasError ? 'Min ≥ Max' : undefined}
            size="small"
            fullWidth
          />
        </Box>
      )}
    </>
  );
};

/**
 * Format a number for display in the text field.
 * Uses scientific notation for very small/large numbers.
 */
function formatForDisplay(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '';
  // Use scientific notation for very small or very large values
  if (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6)) {
    return value.toExponential();
  }
  // Avoid excessive decimal places from floating point
  return parseFloat(value.toPrecision(10)).toString();
}

export default ValueRangeInput;
