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
import type { PolarDataPoint } from '../postprocessing/plots/PolarPlot';
import { PORT_TABLE_COLUMNS } from '@/types/plotDefinitions';
import { ViewItemRenderer } from '../postprocessing/ViewItemRenderer';
import { Colorbar } from '../postprocessing/Colorbar';
import TimeAnimationOverlay from '../postprocessing/TimeAnimationOverlay';
import FrequencySelector from '../postprocessing/FrequencySelector';
import { SweepVariableSelector } from '../postprocessing/SweepVariableSelector';
import ExportPDFDialog from './dialogs/ExportPDFDialog';
import { exportToPDF } from '@/utils/exportToPDF';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useAnimationPhase } from '@/hooks/useAnimationPhase';
import {
  selectViewConfigurations,
  selectSelectedViewId,
  selectSelectedItemId,
  selectView,
  deleteViewConfiguration,
  renameViewConfiguration,
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

  // Handle PDF export
  const handlePDFExport = async (options: {
    includeMetadata: boolean;
    resolution: '1080p' | '1440p' | '4K';
    filename: string;
  }) => {
    if (!middlePanelRef.current || !selectedViewId) {
      setSnackbarMessage('Error: Cannot export - no view selected');
      setShowSnackbar(true);
      return;
    }

    const selectedView = viewConfigurations.find((v) => v.id === selectedViewId);
    if (!selectedView) {
      setSnackbarMessage('Error: Selected view not found');
      setShowSnackbar(true);
      return;
    }

    try {
      await exportToPDF({
        targetElement: middlePanelRef.current,
        view: selectedView,
        metadata: {
          include: options.includeMetadata,
          projectName,
          frequency: displayFrequencyHz ?? undefined,
        },
        resolution: options.resolution,
        filename: options.filename,
      });

      setSnackbarMessage(`PDF exported successfully: ${options.filename}.pdf`);
      setShowSnackbar(true);
    } catch (error) {
      console.error('PDF export failed:', error);
      setSnackbarMessage(`Error: ${error instanceof Error ? error.message : 'PDF export failed'}`);
      setShowSnackbar(true);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RIBBON MENU */}
      <RibbonMenu currentTab="postprocessing" />

      {/* EXPORT PDF DIALOG */}
      <ExportPDFDialog projectName={projectName} onExport={handlePDFExport} />

      {/* SNACKBAR FOR NOTIFICATIONS */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={4000}
        onClose={() => setShowSnackbar(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* WARNING BANNER - Show when no results, results are stale, or design changed (not during sweep navigation) */}
      {(!frequencySweep && !currentFrequency) || resultsStale || (!isSweepMode && !isSolved) ? (
        <Alert
          severity={resultsStale ? "warning" : "info"}
          sx={{ m: 2, mb: 0 }}
        >
          <AlertTitle>
            {resultsStale ? "Results Outdated" :
             !currentFrequency && !frequencySweep ? "No Results Available" :
             "Design Modified"}
          </AlertTitle>
          {resultsStale
            ? "The antenna structure or solver settings have changed. Run the solver again to update results."
            : !currentFrequency && !frequencySweep
            ? "No solver results found. Please run the solver first."
            : "The antenna structure has been modified. Results shown may be outdated. Run the solver again to update."}
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
            onViewSelect={(viewId) => dispatch(selectView(viewId))}
            onViewDelete={(viewId) => dispatch(deleteViewConfiguration(viewId))}
            onViewRename={(viewId, newName) => dispatch(renameViewConfiguration({ viewId, name: newName }))}
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
            // Extract polar data from radiation pattern at current frequency
            const patternData = displayFrequencyHz != null ? radiationPatterns?.[displayFrequencyHz] : null;
            let polarData: PolarDataPoint[] = [];
            if (patternData?.theta_angles && patternData?.phi_angles && patternData?.pattern_db) {
              const thetaAngles = patternData.theta_angles as number[];
              const phiAngles = patternData.phi_angles as number[];
              const patternDb = patternData.pattern_db as number[];
              const offset = (patternData.directivity as number) || 0;
              const nTheta = thetaAngles.length;
              const nPhi = phiAngles.length;

              const cutPlane = polarItem?.polarCutPlane ?? 'phi';
              const cutAngleDeg = polarItem?.polarCutAngleDeg ?? 0;

              if (cutPlane === 'phi') {
                // phi-cut: vary theta at fixed phi
                // Find closest phi index
                const cutAngleRad = (cutAngleDeg * Math.PI) / 180;
                let bestPhiIdx = 0;
                let bestDist = Infinity;
                for (let j = 0; j < nPhi; j++) {
                  const d = Math.abs(phiAngles[j] - cutAngleRad);
                  if (d < bestDist) { bestDist = d; bestPhiIdx = j; }
                }
                polarData = thetaAngles.map((thetaRad, thetaIdx) => {
                  const flatIdx = thetaIdx * nPhi + bestPhiIdx;
                  const dbVal = patternDb[flatIdx] ?? -40;
                  return {
                    angleDeg: (thetaRad * 180) / Math.PI,
                    value: (polarItem?.polarScale === 'linear')
                      ? Math.pow(10, (dbVal + offset) / 10)
                      : dbVal + offset,
                  };
                });
              } else {
                // theta-cut: vary phi at fixed theta
                const cutAngleRad = (cutAngleDeg * Math.PI) / 180;
                let bestThetaIdx = 0;
                let bestDist = Infinity;
                for (let i = 0; i < nTheta; i++) {
                  const d = Math.abs(thetaAngles[i] - cutAngleRad);
                  if (d < bestDist) { bestDist = d; bestThetaIdx = i; }
                }
                polarData = phiAngles.map((phiRad, phiIdx) => {
                  const flatIdx = bestThetaIdx * nPhi + phiIdx;
                  const dbVal = patternDb[flatIdx] ?? -40;
                  return {
                    angleDeg: (phiRad * 180) / Math.PI,
                    value: (polarItem?.polarScale === 'linear')
                      ? Math.pow(10, (dbVal + offset) / 10)
                      : dbVal + offset,
                  };
                });
              }
            }
            const cutLabel = polarItem?.polarCutPlane === 'theta'
              ? `θ-cut @ θ=${polarItem?.polarCutAngleDeg ?? 0}°`
              : `φ-cut @ φ=${polarItem?.polarCutAngleDeg ?? 0}°`;
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', overflow: 'auto' }}>
                <PolarPlot
                  data={polarData}
                  scale={polarItem?.polarScale ?? 'dB'}
                  title={polarItem?.label ?? cutLabel}
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
            return (
              <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
                <PortQuantityTable
                  columns={tableItem?.tableColumns ?? PORT_TABLE_COLUMNS}
                  frequencySweep={frequencySweep}
                  parameterStudy={parameterStudy}
                  z0={portZ0}
                  title={tableItem?.label}
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
