import { useState } from 'react';
import { Button, Tooltip, Snackbar, Alert } from '@mui/material';
import { Ribbon, RibbonButtons, RibbonGroup } from '@/features/workflow/Workspace';
import { Add as AddIcon } from '@mui/icons-material';
import AddCurveDialog from '../postprocessing/AddCurveDialog';
import type { AddCurveResult } from '../postprocessing/AddCurveDialog';
import {
  selectParameterStudy,
  selectFrequencySweep,
  selectSolverResults,
  selectCurrentDistribution,
  selectRadiationPattern,
  selectRadiationPatterns,
} from '@/store/solverSlice';
import type { PlotTrace } from '@/types/plotDefinitions';
import {
  CableOutlined,
  RadioButtonChecked,
  Loop,
  Widgets,
  CheckCircle,
  Add,
  Sensors,
  PictureAsPdf,
  SaveAlt,
  Image as ImageIcon,
  DataObject,
  AccountTree,
  ElectricalServices,
  BoltOutlined,
  Radar,
  TableChart,
  Layers,
  Send,
  Landscape,
} from '@mui/icons-material';
import { selectGroundPlane, setGroundPlane } from '@/store/designSlice';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import {
  setAddViewDialogOpen,
  setAddAntennaDialogOpen,
  setAddFieldDialogOpen,
  setExportPDFDialogOpen,
  setExportType,
  addItemToView,
  updateItemProperty,
  requestPngExport,
} from '@/store/postprocessingSlice';
import { buildResultsJSON, downloadFile, safeFilename } from '@/utils/exportData';
import { exportToVTU, canExportToVTU, fieldDataTarget } from '@/utils/ParaViewExporter';
import type { RootState } from '@/store';

interface RibbonMenuProps {
  currentTab?: 'designer' | 'circuit' | 'solver' | 'postprocessing';
  onAntennaTypeSelect?: (type: string) => void;
  onAnalysisAction?: (action: string) => void;
  onViewOption?: (option: string) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
  solverProgress?: number;
  /** Show submit button when project belongs to a course */
  showSubmit?: boolean;
  onSubmit?: () => void;
}

/**
 * RibbonMenu - Top toolbar with context-aware actions for each tab
 * - Designer: Antenna types and elements
 * - Solver: (future implementation)
 * - Postprocessing: View management, item addition, export
 */
function RibbonMenu({
  currentTab = 'designer',
  onAntennaTypeSelect,
  onAnalysisAction,
  showSubmit,
  onSubmit,
}: RibbonMenuProps) {
  const dispatch = useAppDispatch();
  const groundPlane = useAppSelector(selectGroundPlane);
  const store = useAppStore();
  const selectedViewId = useAppSelector((state) => state.postprocessing.selectedViewId);
  const selectedElementId = useAppSelector((state) => state.design.selectedElementId);
  const viewConfigurations = useAppSelector((state) => state.postprocessing.viewConfigurations);
  const selectedViewData = useAppSelector((state) =>
    state.postprocessing.viewConfigurations.find(v => v.id === selectedViewId)
  );

  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  // Postprocessing action handlers
  const handleAddView = () => {
    dispatch(setAddViewDialogOpen(true));
  };

  const handleAddField = () => {
    dispatch(setAddFieldDialogOpen(true));
  };

  const handleAddDirectivity = () => {
    if (!selectedViewId) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'directivity',
        visible: true,
        label: 'Directivity',
        colorMap: 'jet',
        opacity: 0.8,
        scale: 'logarithmic',
      },
    }));
  };

  const handleAddAntennaSystem = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'antenna-system',
        visible: true,
        label: 'Antenna System',
        opacity: 1.0,
      },
    }));
  };

  const handleAddAntennaElement = () => {
    dispatch(setAddAntennaDialogOpen(true));
  };

  const handleAddCurrentDistribution = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'current',
        visible: true,
        label: 'Current Distribution',
        colorMap: 'jet',
        edgeSize: 3,
        displayQuantity: 'magnitude',
        valueRangeMode: 'auto',
        showColorbar: true,
      },
    }));
  };

  const handleAddVoltageDistribution = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'voltage',
        visible: true,
        label: 'Potential Distribution',
        colorMap: 'jet',
        nodeSize: 3,
        displayQuantity: 'magnitude',
        valueRangeMode: 'auto',
        showColorbar: true,
      },
    }));
  };

  // Add Curve dialog state (Line view)
  const [addCurveDialogOpen, setAddCurveDialogOpen] = useState(false);
  const parameterStudy = useAppSelector(selectParameterStudy);
  const frequencySweep = useAppSelector(selectFrequencySweep);
  const solverResults = useAppSelector(selectSolverResults);
  const currentDistribution = useAppSelector(selectCurrentDistribution);
  const radiationPattern = useAppSelector(selectRadiationPattern);
  const radiationPatterns = useAppSelector(selectRadiationPatterns);

  const hasPortData =
    (frequencySweep?.results?.length ?? 0) > 0 ||
    solverResults != null ||
    (parameterStudy?.results?.length ?? 0) > 0;
  const hasDistributionData =
    currentDistribution != null ||
    (frequencySweep?.currentDistributions?.length ?? 0) > 0;
  const hasFarfieldData = radiationPattern != null || radiationPatterns != null;

  const handleAddCurveResult = (result: AddCurveResult) => {
    if (!selectedViewId) return;
    // Find existing line-plot item or create one
    const lineItem = selectedViewData?.items.find((i) => i.type === 'line-plot');
    if (lineItem) {
      const existing: PlotTrace[] = lineItem.traces ?? [];
      dispatch(updateItemProperty({
        viewId: selectedViewId,
        itemId: lineItem.id,
        property: 'traces',
        value: [...existing, ...result.traces],
      }));
    } else {
      dispatch(addItemToView({
        viewId: selectedViewId,
        item: {
          type: 'line-plot',
          visible: true,
          traces: result.traces,
        },
      }));
    }
  };

  const existingTraceCount = selectedViewData?.items
    .filter((i) => i.type === 'line-plot')
    .reduce((acc, i) => acc + (i.traces?.length ?? 0), 0) ?? 0;

  const handleAddSmithChart = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'smith-chart',
        visible: true,
        label: 'Smith Chart',
        smithDataSource: 'frequency-sweep',
        referenceImpedance: 50,
      },
    }));
  };

  const handleAddPolarPlot = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'polar-plot',
        visible: true,
        label: 'Radiation Pattern',
        polarCutPlane: 'phi',
        polarCutAngleDeg: 90,
        polarQuantity: 'directivity',
        polarScale: 'dB',
      },
    }));
  };

  const handleAddPolarSweepOverlay = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'polar-plot',
        visible: true,
        label: 'Sweep Overlay',
        polarCutPlane: 'phi',
        polarCutAngleDeg: 90,
        polarQuantity: 'directivity',
        polarScale: 'dB',
        sweepOverlay: true,
      },
    }));
  };

  const handleAddPortTable = () => {
    if (!selectedViewId) return;
    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'port-table',
        visible: true,
        label: 'Port Quantities',
      },
    }));
  };

  const handleExportJSON = () => {
    const state = store.getState() as unknown as RootState;
    const project = state.projects.currentProject;
    downloadFile(
      buildResultsJSON(state, project),
      `${safeFilename(project?.name ?? 'project')}_results.json`,
      'application/json',
    );
  };

  const handleExportPDF = () => {
    dispatch(setExportType('pdf'));
    dispatch(setExportPDFDialogOpen(true));
  };

  const handleExportParaView = async () => {
    dispatch(setExportType('paraview'));

    // Find first field item in current view
    const currentView = selectedViewId
      ? viewConfigurations.find(v => v.id === selectedViewId)
      : null;

    if (!currentView) {
      setSnackbarMessage('No view selected for export');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Find first field-magnitude item
    const fieldItem = currentView.items.find(item =>
      item.type === 'field-magnitude' || item.type === 'field-vector'
    );

    if (!fieldItem || !('fieldId' in fieldItem)) {
      setSnackbarMessage('No field data in this view. Add a field visualization first.');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    const state = store.getState() as unknown as RootState;
    // Sweep results are keyed by sweep point, single solves by frequency
    const target = fieldDataTarget(state.solver);

    if (target == null) {
      setSnackbarMessage('No frequency data available');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Check if we can export
    if (!canExportToVTU(fieldItem.fieldId, target.key, state)) {
      setSnackbarMessage('Field data not computed yet. Run postprocessing first.');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Generate filename
    const filename = safeFilename(`${currentView.name}_${target.label}`);

    try {
      await exportToVTU({
        fieldId: fieldItem.fieldId,
        key: target.key,
        frequencyHz: target.frequencyHz,
        filename,
      }, state);

      setSnackbarMessage(`VTU file exported: ${filename}.vtu`);
      setSnackbarSeverity('success');
      setShowSnackbar(true);
    } catch (error) {
      console.error('VTU export failed:', error);
      setSnackbarMessage(error instanceof Error ? error.message : 'VTU export failed');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };

  return (
    <>
      <Ribbon>

          {/* DESIGNER TAB RIBBON */}
          {currentTab === 'designer' && (
            <>
              {/* Components Section */}
              <RibbonGroup label="Components">
                <RibbonButtons>
                  <Tooltip title="Create dipole antenna">
                    <Button
                      startIcon={<CableOutlined />}
                      onClick={() => onAntennaTypeSelect?.('dipole')}
                    >
                      Dipole
                    </Button>
                  </Tooltip>
                  <Tooltip title="Create loop antenna">
                    <Button
                      startIcon={<Loop />}
                      onClick={() => onAntennaTypeSelect?.('loop')}
                    >
                      Loop
                    </Button>
                  </Tooltip>
                  <Tooltip title="Create rod/wire antenna">
                    <Button
                      startIcon={<CableOutlined />}
                      onClick={() => onAntennaTypeSelect?.('rod')}
                    >
                      Rod
                    </Button>
                  </Tooltip>
                  <Tooltip title="Create custom wire structure">
                    <Button
                      startIcon={<Widgets />}
                      onClick={() => onAntennaTypeSelect?.('custom')}
                    >
                      Custom
                    </Button>
                  </Tooltip>
                </RibbonButtons>
              </RibbonGroup>


              {/* Edit Circuitry Section */}
              <RibbonGroup label="Edit Circuitry">
                <RibbonButtons>
                  <Tooltip title={selectedElementId ? "Open circuit editor (sources + loads)" : "Select an antenna element first"}>
                    <span>
                    <Button
                      startIcon={<AccountTree />}
                      onClick={() => onAntennaTypeSelect?.('circuit-editor')}
                      disabled={!selectedElementId}
                    >
                      Edit Circuitry
                    </Button>
                    </span>
                  </Tooltip>
                </RibbonButtons>
              </RibbonGroup>


              {/* Edit Geometry Section */}
              <RibbonGroup label="Edit Geometry">
                <RibbonButtons>
                  <Tooltip title="Validate geometry before simulation">
                    <Button
                      startIcon={<CheckCircle />}
                      onClick={() => onAnalysisAction?.('validate-geometry')}
                    >
                      Validate
                    </Button>
                  </Tooltip>
                  <Tooltip
                    title={
                      groundPlane
                        ? 'Ground plane on: perfectly conducting plane at z = 0 (node 0 is the plane). Click to remove.'
                        : 'Add a perfectly conducting ground plane at z = 0, e.g. for monopoles (rods)'
                    }
                  >
                    <Button
                      startIcon={<Landscape />}
                      variant={groundPlane ? 'contained' : 'outlined'}
                      aria-pressed={groundPlane}
                      onClick={() => dispatch(setGroundPlane(!groundPlane))}
                    >
                      Ground plane
                    </Button>
                  </Tooltip>
                </RibbonButtons>
              </RibbonGroup>

              {/* Submit to Course (only when project comes from a course) */}
              {showSubmit && (
                <>
                  <RibbonGroup label="Course">
                    <RibbonButtons>
                      <Tooltip title="Submit this project to your course for review">
                        <Button
                          startIcon={<Send />}
                          onClick={onSubmit}
                          color="primary"
                        >
                          Submit
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>
                </>
              )}
            </>
          )}

          {/* POSTPROCESSING TAB RIBBON */}
          {currentTab === 'postprocessing' && (
            <>
              {/* View Configuration Section */}
              <RibbonGroup label="View Configuration">
                <RibbonButtons>
                  <Tooltip title="Create new result view (3D or Line)">
                    <Button
                      startIcon={<Add />}
                      onClick={handleAddView}
                    >
                      Add View
                    </Button>
                  </Tooltip>
                </RibbonButtons>
              </RibbonGroup>


              {/* 3D-only sections */}
              {selectedViewData?.viewType === '3D' && (
                <>
                  {/* Antenna Structure Section (3D only) */}
                  <RibbonGroup label="Antenna Structure">
                    <RibbonButtons>
                      <Tooltip title="Add full antenna system to view">
                        <Button
                          startIcon={<AccountTree />}
                          onClick={handleAddAntennaSystem}
                          disabled={!selectedViewId}
                        >
                          System
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add individual antenna element to view">
                        <Button
                          startIcon={<CableOutlined />}
                          onClick={handleAddAntennaElement}
                          disabled={!selectedViewId}
                        >
                          Element
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>


                  {/* Distribution Section (3D only) */}
                  <RibbonGroup label="Distribution">
                    <RibbonButtons>
                      <Tooltip title="Add current distribution visualization">
                        <Button
                          startIcon={<ElectricalServices />}
                          onClick={handleAddCurrentDistribution}
                          disabled={!selectedViewId}
                        >
                          Current
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add potential (voltage) distribution visualization">
                        <Button
                          startIcon={<BoltOutlined />}
                          onClick={handleAddVoltageDistribution}
                          disabled={!selectedViewId}
                        >
                          Potential
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>


                  {/* Field Result Section (3D only) */}
                  <RibbonGroup label="Field Result">
                    <RibbonButtons>
                      <Tooltip title="Add field visualization (magnitude or vector)">
                        <Button
                          startIcon={<Sensors />}
                          onClick={handleAddField}
                          disabled={!selectedViewId}
                        >
                          Add Field
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add directivity pattern">
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddDirectivity}
                          disabled={!selectedViewId}
                        >
                          Directivity
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>

                </>
              )}

              {/* Add Curve Section (Line view only) */}
              {selectedViewData?.viewType === 'Line' && (
                <>
                  <RibbonGroup label="Curves">
                    <RibbonButtons>
                      <Tooltip title="Add a curve to this line plot (impedance, VSWR, current, voltage, ...)">
                        <Button
                          startIcon={<AddIcon />}
                          onClick={() => setAddCurveDialogOpen(true)}
                          disabled={!selectedViewId}
                        >
                          Add Curve
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>

                </>
              )}

              {/* Smith Chart Section (Smith view only) */}
              {selectedViewData?.viewType === 'Smith' && (
                <>
                  <RibbonGroup label="Smith Chart">
                    <RibbonButtons>
                      <Tooltip title="Add impedance locus on Smith chart">
                        <Button
                          startIcon={<Radar />}
                          onClick={handleAddSmithChart}
                          disabled={!selectedViewId}
                        >
                          Impedance Locus
                        </Button>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>

                </>
              )}

              {/* Polar Plot Section (Polar view only) */}
              {selectedViewData?.viewType === 'Polar' && (() => {
                const hasAnyPolarItem = selectedViewData.items.some(i => i.type === 'polar-plot');
                return (
                <>
                  <RibbonGroup label="Radiation Pattern">
                    <RibbonButtons>
                      <Tooltip title={hasAnyPolarItem ? 'A radiation pattern item already exists in this view' : 'Add radiation pattern polar cut'}>
                        <span>
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddPolarPlot}
                          disabled={!selectedViewId || hasAnyPolarItem}
                        >
                          Pattern Cut
                        </Button>
                        </span>
                      </Tooltip>
                      {parameterStudy && parameterStudy.results.length > 1 && (
                        <Tooltip title={hasAnyPolarItem ? 'A radiation pattern item already exists in this view' : 'Overlay all sweep points on one polar chart'}>
                          <span>
                          <Button
                            startIcon={<Layers />}
                            onClick={handleAddPolarSweepOverlay}
                            disabled={!selectedViewId || hasAnyPolarItem}
                          >
                            Sweep Overlay
                          </Button>
                          </span>
                        </Tooltip>
                      )}
                    </RibbonButtons>
                  </RibbonGroup>

                </>
                );
              })()}

              {/* Table Section (Table view only) */}
              {selectedViewData?.viewType === 'Table' && (
                <>
                  <RibbonGroup label="Tables">
                    <RibbonButtons>
                      <Tooltip title={selectedViewData?.items.some((i) => i.type === 'port-table') ? 'Port quantities already added' : 'Add port impedance/VSWR/Return Loss table'}>
                        <span>
                          <Button
                            startIcon={<TableChart />}
                            onClick={handleAddPortTable}
                            disabled={!selectedViewId || selectedViewData?.items.some((i) => i.type === 'port-table')}
                          >
                            Port Quantities
                          </Button>
                        </span>
                      </Tooltip>
                    </RibbonButtons>
                  </RibbonGroup>

                </>
              )}

              {/* Export Section */}
              <RibbonGroup label="Export">
                <RibbonButtons>
                  <Tooltip title="Export view to PDF report">
                    <Button
                      startIcon={<PictureAsPdf />}
                      onClick={handleExportPDF}
                      disabled={!selectedViewId}
                    >
                      PDF
                    </Button>
                  </Tooltip>
                  <Tooltip title="Save the current view as PNG image">
                    <Button
                      startIcon={<ImageIcon />}
                      onClick={() => dispatch(requestPngExport())}
                      disabled={!selectedViewId}
                    >
                      PNG
                    </Button>
                  </Tooltip>
                  <Tooltip title="Download all solver results (impedances, currents, sweeps, patterns) as JSON">
                    <Button startIcon={<DataObject />} onClick={handleExportJSON}>
                      JSON
                    </Button>
                  </Tooltip>
                  <Tooltip title="Export field data to ParaView (VTU format)">
                    <Button
                      startIcon={<SaveAlt />}
                      onClick={handleExportParaView}
                      disabled={!selectedViewId}
                    >
                      ParaView
                    </Button>
                  </Tooltip>
                </RibbonButtons>
              </RibbonGroup>
            </>
          )}
      </Ribbon>

      {/* SNACKBAR FOR NOTIFICATIONS */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={4000}
        onClose={() => setShowSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSnackbar(false)}
          severity={snackbarSeverity}
          variant="filled"
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Add Curve wizard dialog (Line views) */}
      <AddCurveDialog
        open={addCurveDialogOpen}
        onClose={() => setAddCurveDialogOpen(false)}
        onAdd={handleAddCurveResult}
        parameterStudy={parameterStudy}
        existingTraceCount={existingTraceCount}
        hasPortData={hasPortData}
        hasDistributionData={hasDistributionData}
        hasFarfieldData={hasFarfieldData}
      />
    </>
  );
}

export default RibbonMenu;
