/**
 * LineViewPanel - Displays multiple line plots stacked vertically
 * Renders UnifiedLinePlot for line-plot items, legacy stub for scalar-plot items.
 */

import { Box, Typography, Divider } from '@mui/material';
import type { ViewConfiguration, ViewItem } from '@/types/postprocessing';
import UnifiedLinePlot from './plots/UnifiedLinePlot';
import { extractPortTraceData } from '@/types/plotDataExtractors';
import type { DataPoint } from '@/types/plotDataExtractors';
import type { AxisConfig } from '@/types/plotDefinitions';
import { useAppSelector } from '@/store/hooks';
import { selectParameterStudy } from '@/store/solverSlice';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const parameterStudy = useAppSelector(selectParameterStudy);

  const visibleItems = view.items.filter((item) => item.visible);

  if (visibleItems.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No plots added to this view. Use the ribbon menu to add impedance, voltage, or current plots.
        </Typography>
      </Box>
    );
  }

  const renderPlot = (item: ViewItem) => {
    if (item.type === 'line-plot' && item.traces && item.traces.length > 0) {
      const sweepVarName = parameterStudy?.config.sweepVariables[0]?.variableName;
      // Build traceData from extractors
      const traceData: Record<string, DataPoint[]> = {};
      for (const trace of item.traces) {
        if (trace.quantity.source === 'port') {
          traceData[trace.id] = extractPortTraceData(
            trace,
            frequencySweep,
            parameterStudy,
          );
        }
        // Field, distribution, farfield extractors can be wired here later
      }

      const defaultXAxis: AxisConfig = {
        label: 'Frequency',
        unit: 'MHz',
        scale: 'linear',
      };

      const xAxisConfig: AxisConfig = parameterStudy && sweepVarName
        ? {
            ...(item.xAxisConfig ?? defaultXAxis),
            label: sweepVarName,
            unit: sweepVarName === 'freq' || sweepVarName === 'frequency' ? 'Hz' : (item.xAxisConfig?.unit ?? ''),
          }
        : (item.xAxisConfig ?? defaultXAxis);

      return (
        <Box key={item.id} sx={{ p: 2, height: 350 }}>
          <UnifiedLinePlot
            traces={item.traces}
            traceData={traceData}
            xAxisConfig={xAxisConfig}
            yAxisLeftConfig={item.yAxisLeftConfig}
            yAxisRightConfig={item.yAxisRightConfig}
            title={item.label}
            height={300}
          />
        </Box>
      );
    }

    // Legacy scalar-plot stub
    return (
      <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Plot type not yet implemented. Use the ribbon menu to add a Line Plot view instead.
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
      {visibleItems.map((item, index) => (
        <Box key={item.id}>
          {renderPlot(item)}
          {index < visibleItems.length - 1 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}

export default LineViewPanel;
