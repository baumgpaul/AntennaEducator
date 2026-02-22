/**
 * SliderWithInput — A MUI Slider paired with a text input for precise value entry.
 *
 * Features:
 * - Slider for quick visual adjustment
 * - Text input accepts '.' and ',' as decimal separators and scientific notation
 * - Values are clamped to [min, max] on blur
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Slider, TextField, Typography } from '@mui/material';
import { parseDecimalNumber, isValidNumericInput } from '../../utils/numberParser';

interface SliderWithInputProps {
  /** Current value */
  value: number;
  /** Minimum slider value */
  min: number;
  /** Maximum slider value */
  max: number;
  /** Slider step */
  step: number;
  /** Label to display above the control */
  label: string;
  /** Unit string to display after value (e.g., 'mm', '°') */
  unit?: string;
  /** Format the value for display in the label */
  formatValue?: (value: number) => string;
  /** Format the slider value label tooltip */
  formatSliderLabel?: (value: number) => string;
  /** Slider scale function (e.g., for logarithmic scales) */
  scale?: (value: number) => number;
  /** Slider marks */
  marks?: Array<{ value: number; label: string }>;
  /** Called when value changes */
  onChange: (value: number) => void;
  /** Width of the text input (default: 80) */
  inputWidth?: number;
}

const SliderWithInput: React.FC<SliderWithInputProps> = ({
  value,
  min,
  max,
  step,
  label,
  unit = '',
  formatValue,
  formatSliderLabel,
  scale,
  marks,
  onChange,
  inputWidth = 80,
}) => {
  const [textValue, setTextValue] = useState(String(value));

  // Sync text with external value
  useEffect(() => {
    setTextValue(formatInputValue(value));
  }, [value]);

  const handleSliderChange = useCallback((_: Event, newValue: number | number[]) => {
    onChange(newValue as number);
  }, [onChange]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (isValidNumericInput(text)) {
      setTextValue(text);
      const parsed = parseDecimalNumber(text);
      if (!isNaN(parsed) && isFinite(parsed)) {
        // Clamp to range
        const clamped = Math.min(max, Math.max(min, parsed));
        onChange(clamped);
      }
    }
  }, [min, max, onChange]);

  const handleTextBlur = useCallback(() => {
    const parsed = parseDecimalNumber(textValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
      setTextValue(formatInputValue(clamped));
    } else {
      // Revert to current value
      setTextValue(formatInputValue(value));
    }
  }, [textValue, value, min, max, onChange]);

  const displayLabel = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" gutterBottom>
        {label}: {displayLabel}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Slider
          value={value}
          onChange={handleSliderChange}
          min={min}
          max={max}
          step={step}
          scale={scale}
          marks={marks}
          valueLabelDisplay="auto"
          valueLabelFormat={formatSliderLabel}
          size="small"
          sx={{ flex: 1 }}
        />
        <TextField
          value={textValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          size="small"
          inputProps={{
            inputMode: 'decimal',
            style: { textAlign: 'right', padding: '4px 8px' },
          }}
          sx={{ width: inputWidth }}
        />
      </Box>
    </Box>
  );
};

/**
 * Format a number for display in the text input.
 */
function formatInputValue(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '';
  if (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6)) {
    return value.toExponential(2);
  }
  return parseFloat(value.toPrecision(6)).toString();
}

export default SliderWithInput;
