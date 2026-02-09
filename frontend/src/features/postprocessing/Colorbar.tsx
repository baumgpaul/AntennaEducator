import React, { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { createColorArray } from '../../utils/colorMaps';

interface ColorbarProps {
  min: number;
  max: number;
  colorMap: 'jet' | 'turbo' | 'viridis' | 'plasma' | 'twilight';
  label?: string;
  unit?: string;
  position?: 'right' | 'left';
}

/**
 * Colorbar - Shows color scale legend for color-mapped visualizations
 * Displays gradient from min to max with value labels
 */
export const Colorbar: React.FC<ColorbarProps> = ({
  min,
  max,
  colorMap,
  label = 'Value',
  unit = '',
  position = 'right'
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Generate gradient for the colorbar
  const gradientStops = useMemo(() => {
    const numStops = 256;
    const values = Array.from({ length: numStops }, (_, i) =>
      min + (max - min) * (i / (numStops - 1))
    );

    const colors = createColorArray(values, colorMap, min, max);

    // Convert to CSS gradient stops
    const stops: string[] = [];
    for (let i = 0; i < numStops; i++) {
      const r = Math.round(colors[i * 3] * 255);
      const g = Math.round(colors[i * 3 + 1] * 255);
      const b = Math.round(colors[i * 3 + 2] * 255);
      const percentage = (i / (numStops - 1)) * 100;
      stops.push(`rgb(${r},${g},${b}) ${percentage.toFixed(1)}%`);
    }

    return stops.join(', ');
  }, [min, max, colorMap]);

  // Format value for display
  const formatValue = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue === 0) return '0';
    if (absValue >= 1000) return value.toExponential(2);
    if (absValue >= 1) return value.toFixed(3);
    if (absValue >= 0.001) return value.toFixed(6);
    return value.toExponential(2);
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        [position]: 16,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: position === 'right' ? 'flex-start' : 'flex-end',
        gap: 0.5,
        backgroundColor: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        padding: 1.5,
        borderRadius: 1,
        boxShadow: isDark ? '0 4px 8px rgba(0,0,0,0.5)' : 2,
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : 'none',
        minWidth: 120,
        zIndex: 1000,
      }}
    >
      {/* Label */}
      <Typography
        variant="caption"
        sx={{
          fontWeight: 'bold',
          mb: 0.5,
          color: isDark ? 'rgba(255,255,255,0.9)' : 'inherit'
        }}
      >
        {label}
      </Typography>

      {/* Gradient bar */}
      <Box
        sx={{
          width: 30,
          height: 200,
          background: `linear-gradient(to top, ${gradientStops})`,
          border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid #ccc',
          borderRadius: 0.5,
        }}
      />

      {/* Value labels */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.7rem',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'inherit'
          }}
        >
          Max: {formatValue(max)} {unit}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.7rem',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'inherit'
          }}
        >
          Mid: {formatValue((max + min) / 2)} {unit}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.7rem',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'inherit'
          }}
        >
          Min: {formatValue(min)} {unit}
        </Typography>
      </Box>
    </Box>
  );
};
