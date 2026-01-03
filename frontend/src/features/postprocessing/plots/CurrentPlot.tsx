/**
 * CurrentPlot - Line chart showing current magnitude and phase vs frequency
 * Displays data for a specific antenna element
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

interface CurrentPoint {
  frequency: number; // Hz
  magnitude: number; // A
  phase: number; // radians
}

interface CurrentPlotProps {
  data: CurrentPoint[];
  antennaId: string;
  antennaName?: string;
  title?: string;
}

function CurrentPlot({ data, antennaId, antennaName, title }: CurrentPlotProps) {
  // Transform data for chart
  const chartData = useMemo(() => {
    return data.map((point) => ({
      frequency: point.frequency / 1e6, // Convert to MHz
      magnitude: point.magnitude,
      phase: point.phase * (180 / Math.PI), // Convert to degrees
    }));
  }, [data]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const freq = payload[0].payload.frequency;
      const mag = payload[0].value;
      const phase = payload[1]?.value || 0;
      
      return (
        <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid #ccc', borderRadius: 1 }}>
          <Typography variant="body2">
            @ {freq.toFixed(2)} MHz
          </Typography>
          <Typography variant="body2" color="primary">
            |I| = {mag.toFixed(3)} A
          </Typography>
          <Typography variant="body2" color="secondary">
            ∠I = {phase.toFixed(1)}°
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
          No current data available for {antennaName || `antenna ${antennaId}`}
        </Typography>
      </Box>
    );
  }

  const plotTitle = title || `Current (${antennaName || antennaId})`;

  return (
    <Box sx={{ width: '100%', height: 350, p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {plotTitle}
      </Typography>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="frequency" 
            label={{ value: 'Frequency (MHz)', position: 'insideBottom', offset: -10 }}
          />
          <YAxis 
            yAxisId="left" 
            label={{ value: 'Magnitude (A)', angle: -90, position: 'insideLeft' }}
          />
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
            name="|I|"
            dot={false}
            strokeWidth={2}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="phase" 
            stroke="#dc004e" 
            name="∠I"
            dot={false}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default CurrentPlot;
