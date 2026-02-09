/**
 * ImpedancePlot - Line chart showing impedance vs frequency
 * Displays Real(Z) and Imag(Z) or Magnitude and Phase (toggled in properties)
 */

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ImpedancePoint {
  frequency: number; // Hz
  real: number; // Ω
  imag: number; // Ω
}

interface ImpedancePlotProps {
  data: ImpedancePoint[];
  title?: string;
  displayMode?: 'rectangular' | 'polar'; // Real/Imag or Magnitude/Phase
}

function ImpedancePlot({ data, title = 'Input Impedance', displayMode = 'rectangular' }: ImpedancePlotProps) {
  // Transform data for chart
  const chartData = useMemo(() => {
    return data.map((point) => {
      const freqMHz = point.frequency / 1e6; // Convert to MHz

      if (displayMode === 'polar') {
        const magnitude = Math.sqrt(point.real ** 2 + point.imag ** 2);
        const phase = Math.atan2(point.imag, point.real) * (180 / Math.PI); // degrees
        return {
          frequency: freqMHz,
          magnitude,
          phase,
        };
      }

      return {
        frequency: freqMHz,
        real: point.real,
        imag: point.imag,
      };
    });
  }, [data, displayMode]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const freq = payload[0].payload.frequency;

      if (displayMode === 'polar') {
        const mag = payload[0].value;
        const phase = payload[1]?.value || 0;
        return (
          <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid #ccc', borderRadius: 1 }}>
            <Typography variant="body2">
              @ {freq.toFixed(2)} MHz
            </Typography>
            <Typography variant="body2" color="primary">
              |Z| = {mag.toFixed(2)} Ω
            </Typography>
            <Typography variant="body2" color="secondary">
              ∠Z = {phase.toFixed(1)}°
            </Typography>
          </Box>
        );
      }

      const real = payload[0].value;
      const imag = payload[1]?.value || 0;
      return (
        <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid #ccc', borderRadius: 1 }}>
          <Typography variant="body2">
            @ {freq.toFixed(2)} MHz
          </Typography>
          <Typography variant="body2" color="primary">
            Re(Z) = {real.toFixed(2)} Ω
          </Typography>
          <Typography variant="body2" color="secondary">
            Im(Z) = {imag.toFixed(2)} Ω
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Z = {real.toFixed(1)} {imag >= 0 ? '+' : ''} j{imag.toFixed(1)} Ω
          </Typography>
        </Box>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No impedance data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 350, p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="frequency"
            label={{ value: 'Frequency (MHz)', position: 'insideBottom', offset: -10 }}
          />
          {displayMode === 'rectangular' ? (
            <>
              <YAxis label={{ value: 'Impedance (Ω)', angle: -90, position: 'insideLeft' }} />
              <Line
                type="monotone"
                dataKey="real"
                stroke="#1976d2"
                name="Re(Z)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="imag"
                stroke="#dc004e"
                name="Im(Z)"
                dot={false}
                strokeWidth={2}
              />
            </>
          ) : (
            <>
              <YAxis yAxisId="left" label={{ value: 'Magnitude (Ω)', angle: -90, position: 'insideLeft' }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Phase (°)', angle: 90, position: 'insideRight' }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="magnitude"
                stroke="#1976d2"
                name="|Z|"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="phase"
                stroke="#dc004e"
                name="∠Z"
                dot={false}
                strokeWidth={2}
              />
            </>
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default ImpedancePlot;
