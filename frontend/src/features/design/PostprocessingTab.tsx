import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  AlertTitle,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import type { SolverWorkflowState } from '@/store/solverSlice';
import { selectResultsStale, selectSolverResults, selectRadiationPattern, selectRadiationPatterns, selectRequestedFields, selectParameterStudy } from '@/store/solverSlice';
import { selectIsSolved } from '@/store/designSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { AntennaElement } from '@/types/models';
import type { FrequencySweepResult } from '@/types/api';
import { selectFieldMagnitudes } from './FieldVisualization';
import { arrayMin, arrayMax } from '@/utils/colorMaps';
import Scene3D from './Scene3D';
import RibbonMenu from './RibbonMenu';
import TreeViewPanel from './TreeViewPanel';
import PostprocessingPropertiesPanel from '../postprocessing/PostprocessingPropertiesPanel';
import LineViewPanel from '../postprocessing/LineViewPanel';
import { SmithChartViewPanel } from '../postprocessing/plots/SmithChartViewPanel';
import { PortQuantityTable } from '../postprocessing/plots/PortQuantityTable';
import PolarPlot from '../postprocessing/plots/PolarPlot';
import type { PolarDataPoint, PolarDataSeries } from '../postprocessing/plots/PolarPlot';
import { PORT_TABLE_COLUMNS, TRACE_COLORS } from '@/types/plotDefinitions';
import { ViewItemRenderer } from '../postprocessing/ViewItemRenderer';
import { Colorbar } from '../postprocessing/Colorbar';
import TimeAnimationOverlay from '../postprocessing/TimeAnimationOverlay';
import FrequencySelector from '../postprocessing/FrequencySelector';
import { SweepVariableSelector } from '../postprocessing/SweepVariableSelector';
import ExportPDFDialog from './dialogs/ExportPDFDialog';
import type { PDFExportOptions } from './dialogs/ExportPDFDialog';
import { generatePDFReport } from '@/utils/pdfReportGenerator';
import html2canvas from 'html2canvas';
import { selectCurrentSubmission } from '@/store/submissionsSlice';
import { selectVariables } from '@/store/variablesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useAnimationPhase } from '@/hooks/useAnimationPhase';
import {
  selectViewConfigurations,
  selectSelectedViewId,
  selectSelectedItemId,
  selectView,
  deleteViewConfiguration,
  renameViewConfiguration,
  duplicateViewConfiguration,
  selectItem,
  removeItemFromView,
  toggleItemVisibility,
} from '@/store/postprocessingSlice';
import { selectSelectedFrequencyHz, selectSolveMode, selectSweepPointIndex } from '@/store/solverSlice';


interface PostprocessingTabProps {
  solverState: SolverWorkflowState;
  elements: AntennaElement[];
  requestedFields: FieldDefinition[];
  directivityRequested: boolean;
  fieldResults: Record<string, { computed: boolean; num_points: number }> | null;
  currentFrequency: number | null; // MHz - current single frequency
  frequencySweep: FrequencySweepResult | null; // Sweep data if available
  fieldData: Record<string, Record<number, {
    points: Array<[number, number, number]>;
    E_mag?: number[];
    H_mag?: number[];
    E_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
    H_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
  }>> | null;
  projectName?: string;
}

import type { ViewItem } from '@/types/postprocessing';
import type { SolverResult, ComplexNumber } from '@/types/models';

/** Compute magnitude of a complex number */
function complexMag(c: ComplexNumber): number {
  return Math.sqrt((c.real || 0) * (c.real || 0) + (c.imag || 0) * (c.imag || 0));
}

// Exported helpers

/**
 * Resolve the fieldType ('E' | 'H' | 'poynting') for a field-related view item.
 * Looks up the field definition from requestedFields using the item's fieldId.
 */
export function resolveFieldType(
  item: ViewItem,
  requestedFields: FieldDefinition[] | null | undefined,
): 'E' | 'H' | 'poynting' {
  if (!item.fieldId || !requestedFields) return 'E';
  const field = requestedFields.find((f) => f.id === item.fieldId);
  return field?.fieldType ?? 'E';
}

/**
 * Get the unit string for a field type.
 */
export function getFieldUnit(fieldType: 'E' | 'H' | 'poynting'): string {
  switch (fieldType) {
    case 'E': return 'V/m';
    case 'H': return 'A/m';
    case 'poynting': return 'W/m\u00B2';
  }
}

/**
 * Get the display label for a field type.
 */
export function getFieldLabel(fieldType: 'E' | 'H' | 'poynting', isVector = false): string {
  switch (fieldType) {
    case 'E': return isVector ? 'E-Field' : '|E|';
    case 'H': return isVector ? 'H-Field' : '|H|';
    case 'poynting': return isVector ? 'Poynting' : '|S|';
  }
}

/** Compute auto min/max range from solver data, matching each renderer's logic */
export function computeAutoRange(
  item: ViewItem,
  solverResults: SolverResult | null,
  fieldData: PostprocessingTabProps['fieldData'],
  radiationPattern: { pattern_db: number[]; directivity?: number; [key: string]: unknown } | null,
  displayFrequencyHz: number | null,
  requestedFields?: FieldDefinition[] | null,
): { min: number; max: number } {
  switch (item.type) {
    case 'current': {
      const currents = solverResults?.branch_currents;
      if (currents && currents.length > 0) {
        const magnitudes = currents.map(complexMag);
        return { min: Math.min(...magnitudes), max: Math.max(...magnitudes) };
      }
      break;
    }
    case 'voltage': {
      const voltages = solverResults?.node_voltages;
      if (voltages && voltages.length > 0) {
        const magnitudes = voltages.map(complexMag);
        return { min: Math.min(...magnitudes), max: Math.max(...magnitudes) };
      }
      break;
    }
    case 'field-magnitude':
    case 'field-vector': {
      if (fieldData && item.fieldId && displayFrequencyHz != null) {
        const freqData = fieldData[item.fieldId]?.[displayFrequencyHz] ?? fieldData[item.fieldId]?.[String(displayFrequencyHz)];
        const ft = resolveFieldType(item, requestedFields);
        const magnitudes = selectFieldMagnitudes(freqData, ft);
        if (magnitudes && magnitudes.length > 0) {
          return { min: arrayMin(magnitudes), max: arrayMax(magnitudes) };
        }
      }
      break;
    }
    case 'directivity': {
      if (radiationPattern?.pattern_db && radiationPattern.pattern_db.length > 0) {
        // Get actual directivity offset to convert normalized dB to absolute dBi
        const directivityOffset = radiationPattern.directivity || 0;

        if (item.scale === 'logarithmic') {
          // Convert normalized pattern_db (max=0) to actual dBi values
          const actualDbi = radiationPattern.pattern_db.map((db: number) => db + directivityOffset);
          const autoMin = Math.min(...actualDbi);
          const autoMax = Math.max(...actualDbi);
          // Clamp min to max - 30 dB for reasonable color range
          const clampedMin = Math.max(autoMin, autoMax - 30);
          return { min: clampedMin, max: autoMax };
        } else {
          // Linear scale: convert to actual linear directivity
          // D = 10^((pattern_db + directivity_dbi)/10)
          const values = radiationPattern.pattern_db.map((db: number) =>
            Math.pow(10, (db + directivityOffset) / 10)
          );
          return { min: Math.min(...values), max: Math.max(...values) };
        }
      }
      break;
    }
  }
  return { min: 0, max: 1 };
}

function PostprocessingTab({
  elements,
  currentFrequency,
  frequencySweep,
  fieldData,
  fieldResults,
  projectName,
}: PostprocessingTabProps) {
  const dispatch = useAppDispatch();

  // Redux state for view configurations
  const viewConfigurations = useAppSelector(selectViewConfigurations);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const resultsStale = useAppSelector(selectResultsStale);
  const isSolved = useAppSelector(selectIsSolved);
  const solverResults = useAppSelector(selectSolverResults);
  const radiationPattern = useAppSelector(selectRadiationPattern);
  const radiationPatterns = useAppSelector(selectRadiationPatterns);
  const requestedFields = useAppSelector(selectRequestedFields);
  const selectedFrequencyHz = useAppSelector(selectSelectedFrequencyHz);
  const solveMode = useAppSelector(selectSolveMode);
  const sweepPointIndex = useAppSelector(selectSweepPointIndex);

  const parameterStudy = useAppSelector(selectParameterStudy);

  // Smith chart summary: |Γ| and VSWR from first solved frequency point
  const smithChartSummary = useMemo(() => {
    const firstResult =
      (frequencySweep?.results?.[0] as any) ??
      (solverResults as any) ??
      null;
    const firstZ =
      firstResult?.antenna_solutions?.[0]?.input_impedance ??
      firstResult?.input_impedance ??
      null;
    if (firstZ == null) return undefined;
    let r = 0, x = 0;
    if (typeof firstZ === 'object' && 'real' in firstZ) {
      r = firstZ.real; x = firstZ.imag;
    } else if (typeof firstZ === 'number') {
      r = firstZ;
    } else {
      return undefined;
    }
    const z0 = 50;
    const denMag2 = (r + z0) ** 2 + x ** 2;
    if (denMag2 < 1e-30) return undefined;
    const gamMag = Math.sqrt((r - z0) ** 2 + x ** 2) / Math.sqrt(denMag2);
    if (!Number.isFinite(gamMag)) return undefined;
    const vswr = gamMag >= 1 ? Infinity : (1 + gamMag) / (1 - gamMag);
    const vswrStr = Number.isFinite(vswr) ? vswr.toFixed(2) : '\u221e';
    return `|\u0393| = ${gamMag.toFixed(3)}, VSWR = ${vswrStr}`;
  }, [frequencySweep, solverResults]);

  const currentUser = useAppSelector((state) => state.auth.user);
  const documentationContent = useAppSelector((state) => state.documentation.content);
  const variables = useAppSelector(selectVariables);
  const currentSubmission = useAppSelector(selectCurrentSubmission);

  // Derive z0 from first element's first port (used for Smith chart)
  const portZ0 = useMemo(() => {
    for (const el of elements) {
      if (el.ports && el.ports.length > 0) return el.ports[0].z0;
    }
    return 50;
  }, [elements]);

  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Auto-open properties panel when a view or item is selected
  useEffect(() => {
    if (selectedItemId || selectedViewId) {
      setRightPanelOpen(true);
    }
  }, [selectedItemId, selectedViewId]);

  const [selectedFrequencyIndex] = useState<number>(0); // legacy, kept for fallback



  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);

  // Ref for the middle panel to capture for PDF export
  const middlePanelRef = useRef<HTMLDivElement>(null);

  // Check if any visible item in the selected view needs time animation
  const hasAnimatedItems = useMemo(() => {
    const selected = viewConfigurations.find(v => v.id === selectedViewId);
    if (!selected || selected.viewType !== '3D') return false;
    return selected.items.some(
      item => item.visible && item.displayQuantity === 'instantaneous',
    );
  }, [viewConfigurations, selectedViewId]);

  // Animation phase hook — only runs when there are animated items
  const { phase: animationPhase, setPhase: setAnimationPhase, phaseDeg } =
    useAnimationPhase(isAnimationPlaying && hasAnimatedItems, animationSpeed);

  // Stop playing when no animated items remain
  useEffect(() => {
    if (!hasAnimatedItems && isAnimationPlaying) {
      setIsAnimationPlaying(false);
    }
  }, [hasAnimatedItems, isAnimationPlaying]);

  const handlePlayPauseToggle = useCallback(() => {
    setIsAnimationPlaying(prev => !prev);
  }, []);

  const handleAnimationSpeedChange = useCallback((speed: number) => {
    setAnimationSpeed(speed);
  }, []);

  // Determine if we're in sweep mode
  const isSweepMode = solveMode === 'sweep' || (frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1);
  const availableFrequencies = isSweepMode ? frequencySweep?.frequencies ?? [] : (currentFrequency ? [currentFrequency * 1e6] : []); // MHz to Hz

  // Get the key for field data / radiation pattern lookup.
  // In sweep mode, field data is keyed by sweep point index (not frequency Hz).
  // In single mode, field data is keyed by frequency Hz.
  const displayFrequencyHz = solveMode === 'sweep'
    ? sweepPointIndex
    : (selectedFrequencyHz
      ?? availableFrequencies[selectedFrequencyIndex]
      ?? (currentFrequency ? currentFrequency * 1e6 : null));

  // Capture a single view panel as PNG data URL for PDF inclusion.
  // Dispatches selectView, waits for re-render, then captures.
  const captureView = useCallback(async (viewId: string): Promise<string> => {
    dispatch(selectView(viewId));
    const view = viewConfigurations.find(v => v.id === viewId);
    if (view?.viewType === '3D') {
      // Three.js WebGL canvas — give React + Three.js time to fully render.
      // The first attempt uses a longer delay because the 3D scene may need to
      // mount from scratch (e.g. when switching from a non-3D tab).
      for (let attempt = 0; attempt < 7; attempt++) {
        const delay = attempt === 0 ? 2000 : attempt === 1 ? 1000 : 500;
        await new Promise<void>(resolve => setTimeout(resolve, delay));
        const canvas = middlePanelRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
        if (canvas) {
          // Force a fresh render frame before capturing
          try {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
              gl.finish();
            }
          } catch { /* ignore */ }
          const url = canvas.toDataURL('image/png');
          if (url && url.startsWith('data:image/') && url.length > 100) return url;
        }
      }
      throw new Error(`3D canvas not ready for view "${view.name}"`);
    }
    // For chart/plot/polar/Smith views: use html2canvas which reliably captures
    // the full DOM including CSS-styled SVGs, Recharts charts, and polar plots.
    // Previous approach (SVG serialization via svgToDataUrl) was unreliable —
    // it lost CSS styles, clip paths, and produced black/blank images.
    if (!middlePanelRef.current) throw new Error('View panel not mounted');
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = attempt === 0 ? 1200 : attempt === 1 ? 800 : 500;
      await new Promise<void>(resolve => setTimeout(resolve, delay));
      try {
        const captured = await html2canvas(middlePanelRef.current, {
          backgroundColor: '#1a1a1a',
          scale: 2, // 2x for crisp PDF
          useCORS: true,
          logging: false,
        });
        const url = captured.toDataURL('image/png');
        if (url && url.startsWith('data:image/') && url.length > 200) return url;
      } catch {
        // html2canvas failed — retry after next delay
      }
    }
    throw new Error(`Could not capture view "${view?.name ?? viewId}"`);
  }, [dispatch, viewConfigurations, middlePanelRef]);

  // Capture the first 3D view for the "Antenna Geometry" PDF section.
  // Temporarily hides all non-antenna items (fields, directivity, currents) so the
  // capture shows only the clean wire geometry.
  // Returns null (not an error) when no 3D view exists — the section will
  // render a placeholder text instead.
  const captureAntennaGeometry = useCallback(async (): Promise<string | null> => {
    const threeDView = viewConfigurations.find(v => v.viewType === '3D');
    if (!threeDView) return null;

    // Identify non-antenna items that should be hidden for the clean geometry capture
    const ANTENNA_TYPES = new Set(['antenna-system', 'single-antenna']);
    const toHide = threeDView.items.filter(
      item => item.visible && !ANTENNA_TYPES.has(item.type)
    );

    // Hide non-antenna items
    for (const item of toHide) {
      dispatch(toggleItemVisibility({ viewId: threeDView.id, itemId: item.id }));
    }

    // Wait for Redux dispatch → React re-render → WebGL re-render
    // Use a real timeout so Three.js has time to produce a new frame
    await new Promise<void>(resolve => setTimeout(resolve, 1000));

    let result: string | null = null;
    try {
      result = await captureView(threeDView.id);
    } catch {
      result = null;
    } finally {
      // Always restore visibility
      for (const item of toHide) {
        dispatch(toggleItemVisibility({ viewId: threeDView.id, itemId: item.id }));
      }
    }
    return result;
  }, [viewConfigurations, captureView, dispatch]);

  // Handle PDF export using multi-page report generator
  const handlePDFExport = async (options: PDFExportOptions) => {
    const originalViewId = selectedViewId;
    try {
      const submissionMeta = currentSubmission
        ? {
            studentName: currentSubmission.username,
            submittedAt: currentSubmission.submitted_at,
            status: currentSubmission.status,
            feedback: currentSubmission.feedback || undefined,
          }
        : undefined;

      await generatePDFReport({
        projectName: projectName ?? 'Project',
        authorName: currentUser?.username,
        elements,
        variables,
        viewConfigurations,
        solverConfig: {
          frequency: currentFrequency ? currentFrequency * 1e6 : undefined,
          numFrequencies: (frequencySweep?.frequencies?.length ?? 0) > 1 ? frequencySweep!.frequencies.length : undefined,
          sweepStart: (frequencySweep?.frequencies?.length ?? 0) > 1 ? frequencySweep!.frequencies[0] : undefined,
          sweepEnd: (frequencySweep?.frequencies?.length ?? 0) > 1 ? frequencySweep!.frequencies[frequencySweep!.frequencies.length - 1] : undefined,
          method: 'peec',
        },
        documentationContent: documentationContent ?? '',
        submissionMeta,
        sections: options.sections,
        captureView,
        captureAntennaGeometry,
        filename: options.filename,
        onProgress: options.onProgress,
      });
      setSnackbarMessage(`PDF exported: ${options.filename}.pdf`);
      setShowSnackbar(true);
    } catch (error) {
      console.error('PDF export failed:', error);
      setSnackbarMessage(`Error: ${error instanceof Error ? error.message : 'PDF export failed'}`);
      setShowSnackbar(true);
    } finally {
      if (originalViewId) dispatch(selectView(originalViewId));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RIBBON MENU */}
      <RibbonMenu currentTab="postprocessing" />

      {/* EXPORT PDF DIALOG */}
      <ExportPDFDialog
        projectName={projectName}
        authorName={currentUser?.username}
        submissionMeta={currentSubmission ? {
          studentName: currentSubmission.username,
          submittedAt: currentSubmission.submitted_at,
          status: currentSubmission.status,
          feedback: currentSubmission.feedback || undefined,
        } : undefined}
        onExport={handlePDFExport}
      />

      {/* SNACKBAR FOR NOTIFICATIONS */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={4000}
        onClose={() => setShowSnackbar(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* WARNING BANNER - Show when no results or results are stale */}
      {(!frequencySweep && !currentFrequency) || resultsStale ? (
        <Alert
          severity={resultsStale ? "warning" : "info"}
          sx={{ m: 2, mb: 0 }}
        >
          <AlertTitle>
            {resultsStale ? "Results Outdated" : "No Results Available"}
          </AlertTitle>
          {resultsStale
            ? "The antenna structure or solver settings have changed. Run the solver again to update results."
            : "No solver results found. Please run the solver first."}
        </Alert>
      ) : null}

      {/* Warning when field definitions changed after postprocessing */}
      {isSolved && fieldResults && Object.values(fieldResults).some(r => r && !r.computed) && (
        <Alert severity="warning" sx={{ m: 2, mb: 0 }}>
          <AlertTitle>Postprocessing Outdated</AlertTitle>
          Field definitions have been modified since the last postprocessing run. Re-run postprocessing to update results.
        </Alert>
      )}

      {/* Port quantities are now rendered via Table view — no inline strip */}

      {/* MAIN CONTENT - 3 PANELS */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* LEFT PANEL - TreeView with View Configurations (280px fixed) */}
        <Box
          sx={{
            width: 280,
            height: '100%',
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
            backgroundColor: 'background.paper',
          }}
        >
          {/* SweepVariableSelector — shown when parameter study results available */}
          <SweepVariableSelector />
          {/* FrequencySelector — shown above tree when sweep results available */}
          <FrequencySelector />
          <TreeViewPanel
            mode="postprocessing"
            viewConfigurations={viewConfigurations}
            selectedViewId={selectedViewId}
            selectedItemId={selectedItemId}
            smithChartSummary={smithChartSummary}
            onViewSelect={(viewId) => dispatch(selectView(viewId))}
            onViewDelete={(viewId) => dispatch(deleteViewConfiguration(viewId))}
            onViewRename={(viewId, newName) => dispatch(renameViewConfiguration({ viewId, name: newName }))}
            onViewDuplicate={(viewId) => dispatch(duplicateViewConfiguration(viewId))}
            onItemSelect={(viewId, itemId) => {
              dispatch(selectView(viewId));
              dispatch(selectItem(itemId));
            }}
            onItemDelete={(viewId, itemId) => dispatch(removeItemFromView({ viewId, itemId }))}
            onItemVisibilityToggle={(viewId, itemId) => dispatch(toggleItemVisibility({ viewId, itemId }))}
          />
        </Box>

      {/* MIDDLE PANEL - 3D Visualization OR Line View + Parameter Study (flex, remaining space) */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
      <Box
        ref={middlePanelRef}
        sx={{
          flex: '1 1 100%',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 200,
          backgroundColor: selectedViewId && viewConfigurations.find(v => v.id === selectedViewId)?.viewType !== '3D'
            ? 'background.default'
            : '#1a1a1a',
        }}
      >
        {!selectedViewId ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="h6" color="text.secondary">
              No view selected. Create a view to get started.
            </Typography>
          </Box>
        ) : (() => {
          const selectedView = viewConfigurations.find((view) => view.id === selectedViewId);

          // Render Line View Panel for Line views
          if (selectedView?.viewType === 'Line') {
            return <LineViewPanel view={selectedView} />;
          }

          // Render Smith Chart for Smith views
          if (selectedView?.viewType === 'Smith') {
            const smithItem = selectedView.items.find(
              (item) => item.visible && item.type === 'smith-chart',
            );
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', overflow: 'auto' }}>
                <SmithChartViewPanel
                  dataSource={smithItem?.smithDataSource ?? 'frequency-sweep'}
                  frequencySweep={frequencySweep}
                  parameterStudy={parameterStudy}
                  z0={smithItem?.referenceImpedance ?? portZ0}
                  title={smithItem?.label}
                />
              </Box>
            );
          }

          // Render Polar Plot for Polar views
          if (selectedView?.viewType === 'Polar') {
            const polarItem = selectedView.items.find(
              (item) => item.visible && item.type === 'polar-plot',
            );

            // Require an explicit polar-plot item
            if (!polarItem) {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    No pattern cut added. Use the ribbon to add a Pattern Cut or Sweep Overlay.
                  </Typography>
                </Box>
              );
            }

            const cutPlane = polarItem.polarCutPlane ?? 'phi';
            const cutAngleDeg = polarItem.polarCutAngleDeg ?? 90;
            const polarScale = polarItem.polarScale ?? 'dB';

            // Helper: extract polar data from a single radiation pattern
            const extractPolarCut = (pattern: typeof radiationPatterns extends Record<number, infer T> | null ? T : never): PolarDataPoint[] => {
              if (!pattern?.theta_angles || !pattern?.phi_angles || !pattern?.pattern_db) return [];
              const thetaAngles = pattern.theta_angles as number[];
              const phiAngles = pattern.phi_angles as number[];
              const patternDb = pattern.pattern_db as number[];
              const offset = (pattern.directivity as number) || 0;
              const nTheta = thetaAngles.length;
              const nPhi = phiAngles.length;

              if (cutPlane === 'phi') {
                const cutAngleRad = (cutAngleDeg * Math.PI) / 180;
                let bestPhiIdx = 0;
                let bestDist = Infinity;
                for (let j = 0; j < nPhi; j++) {
                  const d = Math.abs(phiAngles[j] - cutAngleRad);
                  if (d < bestDist) { bestDist = d; bestPhiIdx = j; }
                }

                // Also find opposite phi (phi + 180°) for the backward hemisphere
                const oppPhiRad = cutAngleRad + Math.PI;
                let oppPhiIdx = 0;
                let oppDist = Infinity;
                for (let j = 0; j < nPhi; j++) {
                  let d = Math.abs(phiAngles[j] - oppPhiRad);
                  d = Math.min(d, Math.abs(phiAngles[j] - oppPhiRad + 2 * Math.PI));
                  d = Math.min(d, Math.abs(phiAngles[j] - oppPhiRad - 2 * Math.PI));
                  if (d < oppDist) { oppDist = d; oppPhiIdx = j; }
                }

                const toValue = (dbVal: number) =>
                  polarScale === 'linear' ? Math.pow(10, (dbVal + offset) / 10) : dbVal + offset;

                // Forward hemisphere: theta 0° → 180° at phi
                const forward = thetaAngles.map((thetaRad, thetaIdx) => {
                  const flatIdx = thetaIdx * nPhi + bestPhiIdx;
                  const dbVal = patternDb[flatIdx] ?? -40;
                  return { angleDeg: (thetaRad * 180) / Math.PI, value: toValue(dbVal) };
                });

                // Backward hemisphere: theta (180°-ε) → ε at opposite phi, mapped to 180°+ → 360°-
                const backward: PolarDataPoint[] = [];
                for (let i = nTheta - 2; i >= 1; i--) {
                  const flatIdx = i * nPhi + oppPhiIdx;
                  const dbVal = patternDb[flatIdx] ?? -40;
                  const thetaDeg = (thetaAngles[i] * 180) / Math.PI;
                  backward.push({ angleDeg: 360 - thetaDeg, value: toValue(dbVal) });
                }

                return [...forward, ...backward];
              } else {
                const cutAngleRad = (cutAngleDeg * Math.PI) / 180;
                let bestThetaIdx = 0;
                let bestDist = Infinity;
                for (let i = 0; i < nTheta; i++) {
                  const d = Math.abs(thetaAngles[i] - cutAngleRad);
                  if (d < bestDist) { bestDist = d; bestThetaIdx = i; }
                }
                return phiAngles.map((phiRad, phiIdx) => {
                  const flatIdx = bestThetaIdx * nPhi + phiIdx;
                  const dbVal = patternDb[flatIdx] ?? -40;
                  return {
                    angleDeg: (phiRad * 180) / Math.PI,
                    value: polarScale === 'linear' ? Math.pow(10, (dbVal + offset) / 10) : dbVal + offset,
                  };
                });
              }
            };

            const cutLabel = cutPlane === 'theta'
              ? `θ-cut @ θ=${cutAngleDeg}°`
              : `φ-cut @ φ=${cutAngleDeg}°`;

            // Sweep overlay: show all sweep points' patterns on one chart
            if (polarItem.sweepOverlay && parameterStudy && radiationPatterns) {
              const sweepVars = parameterStudy.config.sweepVariables;
              const vis = polarItem.sweepOverlayVisibility;
              const datasets: PolarDataSeries[] = [];
              for (let ptIdx = 0; ptIdx < parameterStudy.results.length; ptIdx++) {
                // Skip hidden series
                if (vis && vis[ptIdx] === false) continue;
                const pattern = radiationPatterns[ptIdx];
                if (!pattern) continue;
                const data = extractPolarCut(pattern);
                if (data.length === 0) continue;
                // Build label from sweep variable values
                const point = parameterStudy.results[ptIdx].point;
                const labelParts = sweepVars.map((sv) => {
                  const val = point.values[sv.variableName];
                  return val != null ? `${sv.variableName}=${val.toPrecision(4)}` : '';
                }).filter(Boolean);
                datasets.push({
                  data,
                  color: TRACE_COLORS[ptIdx % TRACE_COLORS.length],
                  label: labelParts.join(', '),
                });
              }
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', overflow: 'auto' }}>
                  <PolarPlot
                    datasets={datasets}
                    scale={polarScale}
                    title={polarItem.label ?? `Sweep Overlay — ${cutLabel}`}
                    size={Math.min(500, 400)}
                  />
                </Box>
              );
            }

            // Single pattern: current sweep point or frequency
            const patternData = displayFrequencyHz != null ? radiationPatterns?.[displayFrequencyHz] : null;
            const polarData = patternData ? extractPolarCut(patternData) : [];

            return (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', overflow: 'auto' }}>
                <PolarPlot
                  data={polarData}
                  scale={polarScale}
                  title={polarItem.label ?? cutLabel}
                  size={Math.min(500, 400)}
                />
              </Box>
            );
          }

          // Render Table for Table views
          if (selectedView?.viewType === 'Table') {
            const tableItem = selectedView.items.find(
              (item) => item.visible && item.type === 'port-table',
            );
            if (!tableItem) {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    No port quantities added. Use the ribbon to add a Port Quantities table.
                  </Typography>
                </Box>
              );
            }
            return (
              <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
                <PortQuantityTable
                  columns={tableItem.tableColumns ?? PORT_TABLE_COLUMNS}
                  frequencySweep={frequencySweep}
                  parameterStudy={parameterStudy}
                  z0={portZ0}
                  title={tableItem.label}
                />
              </Box>
            );
          }

          // Render 3D Scene for 3D views
          return (
            <Scene3D elements={elements} showScale showAxisLabels>
              {/* Render all visible items in the selected view */}
              {selectedView?.items
                .filter((item) => item.visible)
                .map((item) => (
                  <ViewItemRenderer
                    key={item.id}
                    item={item}
                    frequencyHz={displayFrequencyHz ?? undefined}
                    animationPhase={hasAnimatedItems ? animationPhase : undefined}
                  />
                ))}
            </Scene3D>
          );
        })()}

        {/* Time Animation Overlay — shown when any vector item has animation enabled */}
        {hasAnimatedItems && (
          <TimeAnimationOverlay
            phase={animationPhase}
            phaseDeg={phaseDeg}
            isPlaying={isAnimationPlaying}
            speed={animationSpeed}
            onPhaseChange={setAnimationPhase}
            onPlayPauseToggle={handlePlayPauseToggle}
            onSpeedChange={handleAnimationSpeedChange}
          />
        )}

        {/* Colorbar - shown when any color-mapped items are visible in 3D views */}
        {selectedViewId && (() => {
          const selectedView = viewConfigurations.find((view) => view.id === selectedViewId);

          // Only show colorbars for 3D views
          if (selectedView?.viewType !== '3D') return null;

          const COLOR_MAPPED_TYPES = ['current', 'voltage', 'field-magnitude', 'directivity', 'field-vector'];
          const colorbarItems = selectedView?.items.filter(
            (item) =>
              item.visible &&
              item.showColorbar !== false &&
              COLOR_MAPPED_TYPES.includes(item.type)
          ) || [];

          if (colorbarItems.length === 0) return null;

          return colorbarItems.map((colorItem, index) => {
            let min = 0, max = 1, label = 'Value', unit = '';

            if (colorItem.valueRangeMode === 'manual') {
              min = colorItem.valueRangeMin ?? 0;
              max = colorItem.valueRangeMax ?? 1;
            } else {
              // Use per-frequency radiation pattern for directivity color range
              const activePattern = (displayFrequencyHz != null && radiationPatterns?.[displayFrequencyHz])
                || radiationPattern;
              const range = computeAutoRange(colorItem, solverResults, fieldData, activePattern, displayFrequencyHz, requestedFields);
              min = range.min;
              max = range.max;
            }

            switch (colorItem.type) {
              case 'current':
                label = 'Current';
                unit = 'A';
                break;
              case 'voltage':
                label = 'Potential';
                unit = 'V';
                break;
              case 'field-magnitude': {
                const ft = resolveFieldType(colorItem, requestedFields);
                label = getFieldLabel(ft, false);
                unit = getFieldUnit(ft);
                break;
              }
              case 'directivity':
                label = 'Directivity';
                unit = colorItem.scale === 'logarithmic' ? 'dBi' : 'linear';
                break;
              case 'field-vector': {
                const ft = resolveFieldType(colorItem, requestedFields);
                label = getFieldLabel(ft, true);
                unit = getFieldUnit(ft);
                break;
              }
            }

            return (
              <Colorbar
                key={colorItem.id}
                min={min}
                max={max}
                colorMap={(colorItem.colorMap || 'jet') as 'jet' | 'turbo' | 'viridis' | 'plasma' | 'twilight'}
                label={label}
                unit={unit}
                position="right"
                stackIndex={index}
              />
            );
          });
        })()}
      </Box>

      {/* Parameter Study results are now rendered via Smith/Line/Table views — no auto split panel */}
      </Box>

      {/* RIGHT PANEL - Properties Panel (320px, collapsible) */}
      {rightPanelOpen && (
        <Box
          sx={{
            width: 320,
            height: '100%',
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'hidden',
            backgroundColor: 'background.paper',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <PostprocessingPropertiesPanel />
          {/* Close toggle */}
          <div style={{
            position: 'absolute',
            left: '-20px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
          }}>
            <Tooltip title="Hide Properties" placement="left">
              <IconButton
                size="medium"
                onClick={() => setRightPanelOpen(false)}
                sx={{
                  bgcolor: 'background.paper',
                  boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ChevronRight fontSize="large" />
              </IconButton>
            </Tooltip>
          </div>
        </Box>
      )}

      {/* Open toggle when panel is closed */}
      {!rightPanelOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
        }}>
          <Tooltip title="Show Properties" placement="left">
            <IconButton
              size="medium"
              onClick={() => setRightPanelOpen(true)}
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ChevronLeft fontSize="large" />
            </IconButton>
          </Tooltip>
        </div>
      )}
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
