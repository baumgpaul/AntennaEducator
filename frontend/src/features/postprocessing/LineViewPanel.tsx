/**
 * LineViewPanel - Displays multiple line plots stacked vertically
 * Renders UnifiedLinePlot for line-plot items, legacy stub for scalar-plot items.
 * Includes "Add Curve" button that opens wizard dialog.
 */

import { useState } from 'react';
import { Box, Typography, Divider, Button, IconButton, Tooltip } from '@mui/material';
import { Add as AddIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { axisHeader, downloadFile, safeFilename, tracesToCSV } from '@/utils/exportData';
import type { ViewConfiguration, ViewItem } from '@/types/postprocessing';
import UnifiedLinePlot from './plots/UnifiedLinePlot';
import AddCurveDialog from './AddCurveDialog';
import type { AddCurveResult, SourceType } from './AddCurveDialog';
import { extractPortTraceData, extractDistributionTraceData, extractFarfieldTraceData, extractFieldTraceData } from '@/types/plotDataExtractors';
import type { DataPoint, FarfieldPatternData } from '@/types/plotDataExtractors';
import type { AxisConfig, PlotTrace } from '@/types/plotDefinitions';
import { defaultXAxis, defaultYAxis, resolveLineAxes, type SweepContext } from './lineAxes';
import { TRACE_COLORS } from '@/types/plotDefinitions';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { selectParameterStudy, selectSelectedFrequencyHz, selectFieldData, selectRequestedFields } from '@/store/solverSlice';
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
  const elements = useAppSelector((state) => state.design.elements);
  const fieldData = useAppSelector(selectFieldData);
  const requestedFields = useAppSelector(selectRequestedFields);
  const [addCurveDialogOpen, setAddCurveDialogOpen] = useState(false);

  // Data availability flags for AddCurveDialog
  const hasPortData = !!(
    (frequencySweep && frequencySweep.results && frequencySweep.results.length > 0) ||
    (parameterStudy && parameterStudy.results && parameterStudy.results.length > 0) ||
    singleResult
  );
  // Single solve: flat (one antenna) or with antenna_solutions (several)
  const single = singleResult as unknown as {
    frequency?: number;
    branch_currents?: unknown[];
    node_voltages?: unknown[];
    input_impedance?: unknown;
    antenna_solutions?: Array<{ branch_currents: unknown[]; node_voltages: unknown[]; input_impedance?: unknown }>;
  } | null;
  const hasDistributionData = !!(
    (frequencySweep && frequencySweep.results && frequencySweep.results.length > 0 &&
      frequencySweep.results.some((r) =>
        r.antenna_solutions?.some((a) => a.branch_currents?.length > 0)
      )) ||
    (singleResult && (
      (single?.branch_currents?.length ?? 0) > 0 ||
      single?.antenna_solutions?.some((a) => (a.branch_currents?.length ?? 0) > 0)
    ))
  );
  const hasFarfieldData = !!(
    radiationPattern ||
    (radiationPatterns && Object.keys(radiationPatterns).length > 0)
  );
  const hasFieldData = !!(fieldData && Object.keys(fieldData).length > 0);

  // Determine the x-axis context from sweep type
  const sweepVarName = parameterStudy?.config.sweepVariables[0]?.variableName;
  const isParamSweep = !!(parameterStudy && parameterStudy.results?.length > 0);
  const isFreqSweep = (frequencySweep?.results?.length ?? 0) > 0;

  const sweepContext: SweepContext = {
    paramSweepVariable: isParamSweep ? sweepVarName : null,
    frequencySweep: isFreqSweep,
  };
  const buildXAxisConfig = (source: string): AxisConfig => defaultXAxis(source, sweepContext);
  const buildYAxisConfig = defaultYAxis;

  const visibleItems = view.items.filter((item) => item.visible);

  // Find the first line-plot item (or null)
  const linePlotItem = view.items.find((item) => item.type === 'line-plot');

  const handleAddCurve = (result: AddCurveResult) => {
    // Guard: prevent adding traces with incompatible sources
    const newSource = result.traces[0]?.quantity.source;
    if (newSource && existingTraceSource && newSource !== existingTraceSource) {
      console.warn('[LineViewPanel] Blocked adding trace with incompatible source:', newSource, 'vs existing:', existingTraceSource);
      return;
    }
    if (newSource && existingTraceMixed) {
      console.warn('[LineViewPanel] Blocked adding trace — view already has mixed sources');
      return;
    }

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

  // Aggregate existing trace sources across all line-plot items in this view.
  const allLinePlotItems = view.items.filter((item) => item.type === 'line-plot');
  let existingTraceCount = 0;
  const existingSources = new Set<string>();
  for (const it of allLinePlotItems) {
    const traces = it.traces ?? [];
    existingTraceCount += traces.length;
    for (const t of traces) {
      if (t?.quantity?.source) existingSources.add(t.quantity.source);
    }
  }
  const existingTraceSource: SourceType | null = existingSources.size === 1 ? Array.from(existingSources)[0] as SourceType : null;
  const existingTraceMixed = existingSources.size > 1;

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
        <Typography variant="body1" sx={{
          color: "text.secondary"
        }}>
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
          hasFieldData={hasFieldData}
          requestedFields={requestedFields}
          existingTraceSource={existingTraceSource}
          existingTraceMixed={existingTraceMixed}
        />
      </Box>
    );
  }

  const renderPlot = (item: ViewItem) => {
    if (item.type === 'line-plot' && item.traces && item.traces.length > 0) {
      // Determine how many antennas have solutions
      const numAntennas = Math.max(
        1,
        frequencySweep?.results?.[0]?.antenna_solutions?.length ?? 0,
        single?.antenna_solutions?.length ?? 0,
        elements.length,
      );

      // For port traces without explicit antennaIndex, expand to one per antenna
      const expandedTraces: PlotTrace[] = [];
      for (const trace of item.traces) {
        if (
          trace.quantity.source === 'port' &&
          trace.antennaIndex === undefined &&
          numAntennas > 1
        ) {
          // Create one trace per antenna element
          for (let ai = 0; ai < numAntennas; ai++) {
            const elName = elements[ai]?.name ?? `Antenna ${ai + 1}`;
            const colorIdx = (expandedTraces.length) % TRACE_COLORS.length;
            expandedTraces.push({
              ...trace,
              id: `${trace.id}_ant${ai}`,
              label: `${trace.label} (${elName})`,
              color: TRACE_COLORS[colorIdx],
              antennaIndex: ai,
            });
          }
        } else {
          expandedTraces.push(trace);
        }
      }

      // Build traceData from extractors
      const traceData: Record<string, DataPoint[]> = {};
      // Determine the frequency key for single-frequency extractors
      const freqKey = selectedFrequencyHz
        ?? frequencySweep?.frequencies?.[0]
        ?? single?.frequency
        ?? 0;

      // Build patterns lookup — merge singular and plural
      const patternsLookup: Record<number, FarfieldPatternData> | null = radiationPatterns
        ?? (radiationPattern ? { [freqKey]: radiationPattern } : null);

      for (const trace of expandedTraces) {
        const antennaIdx = trace.antennaIndex ?? 0;
        switch (trace.quantity.source) {
          case 'port':
            traceData[trace.id] = extractPortTraceData(
              trace,
              frequencySweep,
              parameterStudy,
              antennaIdx,
              50,
              single as Parameters<typeof extractPortTraceData>[5],
            );
            break;
          case 'distribution':
            traceData[trace.id] = extractDistributionTraceData(
              trace,
              frequencySweep,
              freqKey,
              antennaIdx,
              single,
            );
            break;
          case 'farfield':
            traceData[trace.id] = extractFarfieldTraceData(
              trace,
              patternsLookup,
              freqKey,
            );
            break;
          case 'field':
            traceData[trace.id] = extractFieldTraceData(
              trace,
              fieldData,
              freqKey,
            );
            break;
        }
      }

      // Items made without axis configs (ribbon "Add Curve", older projects) get defaults
      const axes = resolveLineAxes(item, sweepContext);

      const handleExportCSV = () => {
        const csv = tracesToCSV(expandedTraces, traceData, axisHeader(axes.x, 'x'));
        downloadFile(csv, `${safeFilename(item.label || view.name, 'plot')}.csv`, 'text/csv;charset=utf-8');
      };

      return (
        <Box key={item.id} sx={{ p: 2, height: 350, position: 'relative' }}>
          <Tooltip title="Export curves as CSV">
            <IconButton
              size="small"
              onClick={handleExportCSV}
              aria-label="Export curves as CSV"
              sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
            >
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <UnifiedLinePlot
            traces={expandedTraces}
            traceData={traceData}
            xAxisConfig={axes.x}
            yAxisLeftConfig={axes.left}
            yAxisRightConfig={axes.right}
            title={item.label}
            height={300}
          />
        </Box>
      );
    }

    // Legacy scalar-plot stub
    return (
      <Box key={item.id} sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
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
        hasFieldData={hasFieldData}
        requestedFields={requestedFields}
        existingTraceSource={existingTraceSource}
        existingTraceMixed={existingTraceMixed}
      />
    </Box>
  );
}

export default LineViewPanel;
