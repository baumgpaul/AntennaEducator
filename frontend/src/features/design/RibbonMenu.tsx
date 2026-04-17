import { useState } from 'react';
import {
  Box,
  Paper,
  ButtonGroup,
  Button,
  Divider,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
  AccountTree,
  ElectricalServices,
  BoltOutlined,
  Radar,
  TableChart,
  Layers,
  Send,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import {
  setAddViewDialogOpen,
  setAddAntennaDialogOpen,
  setAddFieldDialogOpen,
  setExportPDFDialogOpen,
  setExportType,
  addItemToView,
  updateItemProperty,
} from '@/store/postprocessingSlice';
import { exportToVTU, canExportToVTU } from '@/utils/ParaViewExporter';
import type { RootState } from '@/store';

interface RibbonMenuProps {
  currentTab?: 'designer' | 'solver' | 'postprocessing';
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
  const store = useAppStore();
  const selectedViewId = useAppSelector((state) => state.postprocessing.selectedViewId);
  const selectedElementId = useAppSelector((state) => state.design.selectedElementId);
  const viewConfigurations = useAppSelector((state) => state.postprocessing.viewConfigurations);
  const currentFrequency = useAppSelector((state) => state.solver.currentFrequency);
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

    const frequencyHz = currentFrequency != null ? currentFrequency * 1e6 : null;

    if (frequencyHz == null) {
      setSnackbarMessage('No frequency data available');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Check if we can export
    if (!canExportToVTU(fieldItem.fieldId, frequencyHz, store.getState() as unknown as RootState)) {
      setSnackbarMessage('Field data not computed yet. Run postprocessing first.');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }

    // Generate filename
    const frequencyMHz = (frequencyHz / 1e6).toFixed(2);
    const filename = `${currentView.name.replace(/[^a-zA-Z0-9]/g, '_')}_${frequencyMHz}MHz`;

    try {
      await exportToVTU({
        fieldId: fieldItem.fieldId,
        frequencyHz,
        filename,
      }, store.getState() as unknown as RootState);

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
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>

          {/* DESIGNER TAB RIBBON */}
          {currentTab === 'designer' && (
            <>
              {/* Components Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Components
                </Box>
                <ButtonGroup variant="outlined" size="small">
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
                </ButtonGroup>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Edit Circuitry Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Edit Circuitry
                </Box>
                <ButtonGroup variant="outlined" size="small">
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
                </ButtonGroup>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Edit Geometry Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Edit Geometry
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Validate geometry before simulation">
                    <Button
                      startIcon={<CheckCircle />}
                      onClick={() => onAnalysisAction?.('validate-geometry')}
                    >
                      Validate
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>

              {/* Submit to Course (only when project comes from a course) */}
              {showSubmit && (
                <>
                  <Divider orientation="vertical" flexItem />
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Course
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Submit this project to your course for review">
                        <Button
                          startIcon={<Send />}
                          onClick={onSubmit}
                          color="primary"
                        >
                          Submit
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>
                </>
              )}
            </>
          )}

          {/* POSTPROCESSING TAB RIBBON */}
          {currentTab === 'postprocessing' && (
            <>
              {/* View Configuration Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  View Configuration
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Create new result view (3D or Line)">
                    <Button
                      startIcon={<Add />}
                      onClick={handleAddView}
                    >
                      Add View
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* 3D-only sections */}
              {selectedViewData?.viewType === '3D' && (
                <>
                  {/* Antenna Structure Section (3D only) */}
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Antenna Structure
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
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
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />

                  {/* Distribution Section (3D only) */}
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Distribution
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
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
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />

                  {/* Field Result Section (3D only) */}
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Field Result
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
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
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Add Curve Section (Line view only) */}
              {selectedViewData?.viewType === 'Line' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Curves
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add a curve to this line plot (impedance, VSWR, current, voltage, ...)">
                        <Button
                          startIcon={<AddIcon />}
                          onClick={() => setAddCurveDialogOpen(true)}
                          disabled={!selectedViewId}
                        >
                          Add Curve
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Smith Chart Section (Smith view only) */}
              {selectedViewData?.viewType === 'Smith' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Smith Chart
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add impedance locus on Smith chart">
                        <Button
                          startIcon={<Radar />}
                          onClick={handleAddSmithChart}
                          disabled={!selectedViewId}
                        >
                          Impedance Locus
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Polar Plot Section (Polar view only) */}
              {selectedViewData?.viewType === 'Polar' && (() => {
                const hasAnyPolarItem = selectedViewData.items.some(i => i.type === 'polar-plot');
                return (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Radiation Pattern
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
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
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
                );
              })()}

              {/* Table Section (Table view only) */}
              {selectedViewData?.viewType === 'Table' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Tables
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
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
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Export Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Export
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Export view to PDF report">
                    <Button
                      startIcon={<PictureAsPdf />}
                      onClick={handleExportPDF}
                      disabled={!selectedViewId}
                    >
                      PDF
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
                </ButtonGroup>
              </Box>
            </>
          )}
        </Box>
      </Box>

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
    </Paper>
  );
}

export default RibbonMenu;
