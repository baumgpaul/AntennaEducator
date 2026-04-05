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
import { extractPortTraceData, extractDistributionTraceData, extractFarfieldTraceData } from '@/types/plotDataExtractors';
import type { DataPoint } from '@/types/plotDataExtractors';
import type { AxisConfig, PlotTrace } from '@/types/plotDefinitions';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { selectParameterStudy, selectSelectedFrequencyHz } from '@/store/solverSlice';
import { updateItemProperty, addItemToView } from '@/store/postprocessingSlice';

interface LineViewPanelProps {
  view: ViewConfiguration;
}

function LineViewPanel({ view }: LineViewPanelProps) {
  const dispatch = useAppDispatch();
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const parameterStudy = useAppSelector(selectParameterStudy);
  const singleResult = useAppSelector((state) => state.solver.results);
  const radiationPattern = useAppSelector((state) => state.solver.radiationPattern);
  const radiationPatterns = useAppSelector((state) => state.solver.radiationPatterns);
  const selectedFrequencyHz = useAppSelector(selectSelectedFrequencyHz);
  const [addCurveDialogOpen, setAddCurveDialogOpen] = useState(false);

  // Data availability flags for AddCurveDialog
  const hasPortData = !!(
    (frequencySweep && frequencySweep.results && frequencySweep.results.length > 0) ||
    (parameterStudy && parameterStudy.results && parameterStudy.results.length > 0) ||
    singleResult
  );
  const hasDistributionData = !!(
    (frequencySweep && frequencySweep.results && frequencySweep.results.length > 0 &&
      frequencySweep.results.some((r) =>
        r.antenna_solutions?.some((a) => a.branch_currents?.length > 0)
      )) ||
    (singleResult && (singleResult as any).branch_currents?.length > 0)
  );
  const hasFarfieldData = !!(
    radiationPattern ||
    (radiationPatterns && Object.keys(radiationPatterns).length > 0)
  );

  // Determine the x-axis context from sweep type
  const sweepVarName = parameterStudy?.config.sweepVariables[0]?.variableName;
  const isParamSweep = !!(parameterStudy && parameterStudy.results?.length > 0);
  const isFreqSweep = !!(frequencySweep && (frequencySweep as any).results?.length > 0);

  /** Build default x-axis config based on sweep context */
  const buildXAxisConfig = (source: string): AxisConfig => {
    if (source === 'distribution') {
      return { label: 'Segment Index', unit: '', scale: 'linear' };
    }
    if (source === 'farfield') {
      return { label: 'θ', unit: '°', scale: 'linear' };
    }
    if (isParamSweep && sweepVarName) {
      const isFreqVar = sweepVarName === 'freq' || sweepVarName === 'frequency';
      return { label: sweepVarName, unit: isFreqVar ? 'Hz' : '', scale: 'linear' };
    }
    if (isFreqSweep) {
      return { label: 'Frequency', unit: 'Hz', scale: 'linear' };
    }
    return { label: 'X', unit: '', scale: 'linear' };
  };

  /** Build default y-axis label from first trace */
  const buildYAxisConfig = (traces: PlotTrace[]): AxisConfig => {
    const first = traces[0];
    if (!first) return { label: 'Y', unit: '', scale: 'linear' };
    const q = first.quantity;
    switch (q.source) {
      case 'port': {
        if (q.quantity.startsWith('impedance')) return { label: 'Impedance', unit: 'Ω', scale: 'linear' };
        if (q.quantity === 'return_loss') return { label: 'Return Loss', unit: 'dB', scale: 'linear' };
        if (q.quantity === 'vswr') return { label: 'VSWR', unit: '', scale: 'linear' };
        if (q.quantity.startsWith('reflection')) return { label: '|Γ|', unit: '', scale: 'linear' };
        return { label: first.label, unit: '', scale: 'linear' };
      }
      case 'distribution': {
        if (q.quantity.startsWith('current')) return { label: 'Current', unit: 'A', scale: 'linear' };
        if (q.quantity.startsWith('voltage')) return { label: 'Voltage', unit: 'V', scale: 'linear' };
        return { label: first.label, unit: '', scale: 'linear' };
      }
      case 'farfield':
        return { label: first.label, unit: 'dBi', scale: 'linear' };
      default:
        return { label: first.label, unit: '', scale: 'linear' };
    }
  };

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
      // Set axis configs if not already set
      if (!linePlotItem.yAxisLeftConfig && result.traces.length > 0) {
        dispatch(updateItemProperty({
          viewId: view.id,
          itemId: linePlotItem.id,
          property: 'yAxisLeftConfig',
          value: buildYAxisConfig(result.traces),
        }));
      }
      if (!linePlotItem.xAxisConfig && result.traces.length > 0) {
        dispatch(updateItemProperty({
          viewId: view.id,
          itemId: linePlotItem.id,
          property: 'xAxisConfig',
          value: buildXAxisConfig(result.traces[0].quantity.source),
        }));
      }
    } else {
      const source = result.traces[0]?.quantity.source ?? 'port';
      // Create a new line-plot item with the traces and axis configs
      dispatch(addItemToView({
        viewId: view.id,
        item: {
          type: 'line-plot',
          visible: true,
          traces: result.traces,
          xAxisConfig: buildXAxisConfig(source),
          yAxisLeftConfig: buildYAxisConfig(result.traces),
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
      // Build traceData from extractors
      const traceData: Record<string, DataPoint[]> = {};
      // Determine the frequency key for single-frequency extractors
      const freqKey = selectedFrequencyHz
        ?? frequencySweep?.frequencies?.[0]
        ?? (singleResult as any)?.frequency
        ?? 0;

      // Build patterns lookup — merge singular and plural
      const patternsLookup: Record<number, any> | null = radiationPatterns
        ?? (radiationPattern ? { [freqKey]: radiationPattern } : null);

      for (const trace of item.traces) {
        switch (trace.quantity.source) {
          case 'port':
            traceData[trace.id] = extractPortTraceData(
              trace,
              frequencySweep,
              parameterStudy,
              0,
              50,
              singleResult as any,
            );
            break;
          case 'distribution':
            traceData[trace.id] = extractDistributionTraceData(
              trace,
              frequencySweep,
              freqKey,
              0,
              singleResult as any,
            );
            break;
          case 'farfield':
            traceData[trace.id] = extractFarfieldTraceData(
              trace,
              patternsLookup,
              freqKey,
            );
            break;
          // field extractors can be wired here when field data is available
        }
      }

      return (
        <Box key={item.id} sx={{ p: 2, height: 350 }}>
          <UnifiedLinePlot
            traces={item.traces}
            traceData={traceData}
            xAxisConfig={item.xAxisConfig}
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
