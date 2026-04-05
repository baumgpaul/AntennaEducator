/**
 * LineViewPanel - Displays multiple line plots stacked vertically
 * Renders UnifiedLinePlot for line-plot items, legacy stub for scalar-plot items.
 * Includes "Add Curve" button that opens wizard dialog.
 */

import { useState } from 'react';
import { Box, Typography, Divider, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { ViewConfiguration, ViewItem } from '@/types/postprocessing';
import UnifiedLinePlot from './plots/UnifiedLinePlot';
import AddCurveDialog from './AddCurveDialog';
import type { AddCurveResult } from './AddCurveDialog';
import { extractPortTraceData } from '@/types/plotDataExtractors';
import type { DataPoint } from '@/types/plotDataExtractors';
import type { AxisConfig, PlotTrace } from '@/types/plotDefinitions';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { selectParameterStudy } from '@/store/solverSlice';
import { updateItemProperty, addItemToView } from '@/store/postprocessingSlice';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  const dispatch = useAppDispatch();
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const parameterStudy = useAppSelector(selectParameterStudy);
  const currentDistribution = useAppSelector((state) => state.solver.currentDistribution);
  const radiationPattern = useAppSelector((state) => state.solver.radiationPattern);
  const radiationPatterns = useAppSelector((state) => state.solver.radiationPatterns);
  const [addCurveDialogOpen, setAddCurveDialogOpen] = useState(false);

  // Data availability flags for AddCurveDialog
  const hasPortData = !!(
    (frequencySweep && frequencySweep.results && frequencySweep.results.length > 0) ||
    (parameterStudy && parameterStudy.results && parameterStudy.results.length > 0)
  );
  const hasDistributionData = !!(currentDistribution && Object.keys(currentDistribution).length > 0);
  const hasFarfieldData = !!(
    radiationPattern ||
    (radiationPatterns && Object.keys(radiationPatterns).length > 0)
  );

  const visibleItems = view.items.filter((item) => item.visible);

  // Find the first line-plot item (or null)
  const linePlotItem = view.items.find((item) => item.type === 'line-plot');

  const handleAddCurve = (result: AddCurveResult) => {
    if (linePlotItem) {
      // Append traces to existing line-plot item
      const existingTraces = linePlotItem.traces ?? [];
      const newTraces: PlotTrace[] = [...existingTraces, ...result.traces];
      dispatch(updateItemProperty({
        viewId: view.id,
        itemId: linePlotItem.id,
        property: 'traces',
        value: newTraces,
      }));
    } else {
      // Create a new line-plot item with the traces
      dispatch(addItemToView({
        viewId: view.id,
        item: {
          type: 'line-plot',
          visible: true,
          traces: result.traces,
        },
      }));
    }
  };

  const existingTraceCount = linePlotItem?.traces?.length ?? 0;

  if (visibleItems.length === 0 && !linePlotItem) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
          gap: 2,
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No curves added yet.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddCurveDialogOpen(true)}
        >
          Add Curve
        </Button>
        <AddCurveDialog
          open={addCurveDialogOpen}
          onClose={() => setAddCurveDialogOpen(false)}
          onAdd={handleAddCurve}
          parameterStudy={parameterStudy}
          existingTraceCount={existingTraceCount}
          hasPortData={hasPortData}
          hasDistributionData={hasDistributionData}
          hasFarfieldData={hasFarfieldData}
        />
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
      {/* Add Curve button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, pb: 0 }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddCurveDialogOpen(true)}
        >
          Add Curve
        </Button>
      </Box>

      {visibleItems.map((item, index) => (
        <Box key={item.id}>
          {renderPlot(item)}
          {index < visibleItems.length - 1 && <Divider />}
        </Box>
      ))}

      <AddCurveDialog
        open={addCurveDialogOpen}
        onClose={() => setAddCurveDialogOpen(false)}
        onAdd={handleAddCurve}
        parameterStudy={parameterStudy}
        existingTraceCount={existingTraceCount}
        hasPortData={hasPortData}
        hasDistributionData={hasDistributionData}
        hasFarfieldData={hasFarfieldData}
      />
    </Box>
  );
}

export default LineViewPanel;
