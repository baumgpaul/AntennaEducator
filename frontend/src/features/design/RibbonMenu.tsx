import { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  ButtonGroup,
  Button,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CableOutlined,
  RadioButtonChecked,
  Loop,
  Widgets,
  PlayArrow,
  Assessment,
  Settings,
  ExpandMore,
  ColorLens,
  TrendingUp,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Add,
  ViewInAr,
  Sensors,
  ShowChart,
  PictureAsPdf,
  SaveAlt,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleVisualizationMode } from '@/store/uiSlice';
import {
  setAddViewDialogOpen,
  setAddAntennaDialogOpen,
  setAddFieldDialogOpen,
  setAddScalarPlotDialogOpen,
  setExportPDFDialogOpen,
  setExportType,
  addItemToView,
} from '@/store/postprocessingSlice';

interface RibbonMenuProps {
  currentTab?: 'designer' | 'solver' | 'postprocessing';
  onAntennaTypeSelect?: (type: string) => void;
  onAnalysisAction?: (action: string) => void;
  onViewOption?: (option: string) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
  solverProgress?: number;
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
  onViewOption, 
  solverStatus = 'idle', 
  solverProgress = 0 
}: RibbonMenuProps) {
  const dispatch = useAppDispatch();
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);
  const selectedView = useAppSelector((state) => state.postprocessing.selectedViewId);
  const selectedViewData = useAppSelector((state) => 
    state.postprocessing.viewConfigurations.find(v => v.id === selectedView)
  );
  
  const [antennaMenuAnchor, setAntennaMenuAnchor] = useState<null | HTMLElement>(null);

  const isSimulationRunning = solverStatus === 'preparing' || solverStatus === 'running';

  const handleAntennaMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAntennaMenuAnchor(event.currentTarget);
  };

  const handleAntennaMenuClose = () => {
    setAntennaMenuAnchor(null);
  };

  const handleAntennaSelect = (type: string) => {
    onAntennaTypeSelect?.(type);
    handleAntennaMenuClose();
  };

  const handleToggleVisualizationMode = () => {
    dispatch(toggleVisualizationMode());
  };

  // Postprocessing action handlers
  const handleAddView = () => {
    dispatch(setAddViewDialogOpen(true));
  };

  const handleAddAntennaSystem = () => {
    if (!selectedView) return;
    
    dispatch(addItemToView({
      viewId: selectedView,
      item: {
        type: 'antenna-system',
        visible: true,
        label: 'Antenna System',
      },
    }));
  };

  const handleAddAntennaElement = () => {
    dispatch(setAddAntennaDialogOpen(true));
  };

  const handleAddCurrentDistribution = () => {
    if (!selectedView) return;
    
    dispatch(addItemToView({
      viewId: selectedView,
      item: {
        type: 'current',
        visible: true,
        label: 'Currents',
        colorMap: 'jet',
        opacity: 0.8,
      },
    }));
  };

  const handleAddVoltageDistribution = () => {
    if (!selectedView) return;
    
    dispatch(addItemToView({
      viewId: selectedView,
      item: {
        type: 'voltage',
        visible: true,
        label: 'Voltages',
        colorMap: 'jet',
        opacity: 0.8,
      },
    }));
  };

  const handleAddField = () => {
    dispatch(setAddFieldDialogOpen(true));
  };

  const handleAddDirectivity = () => {
    if (!selectedView) return;
    
    dispatch(addItemToView({
      viewId: selectedView,
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

  const handleAddImpedancePlot = () => {
    dispatch(setAddScalarPlotDialogOpen(true));
    // TODO: Pre-select impedance in dialog
  };

  const handleAddVoltagePlot = () => {
    dispatch(setAddScalarPlotDialogOpen(true));
    // TODO: Pre-select voltage in dialog
  };

  const handleAddCurrentPlot = () => {
    dispatch(setAddScalarPlotDialogOpen(true));
    // TODO: Pre-select current in dialog
  };

  const handleExportPDF = () => {
    dispatch(setExportType('pdf'));
    dispatch(setExportPDFDialogOpen(true));
  };

  const handleExportParaView = () => {
    dispatch(setExportType('paraview'));
    // TODO: Export to VTU format
    console.log('Export to ParaView (VTU)');
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          
          {/* DESIGNER TAB RIBBON */}
          {currentTab === 'designer' && (
            <>
              {/* Antenna Types Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Antenna Types
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
                  <Tooltip title="Create helix antenna">
                    <Button
                      startIcon={<Widgets />}
                      onClick={() => onAntennaTypeSelect?.('helix')}
                    >
                      Helix
                    </Button>
                  </Tooltip>
                  <Tooltip title="More antenna types">
                    <Button
                      onClick={handleAntennaMenuOpen}
                      endIcon={<ExpandMore />}
                    >
                      More
                    </Button>
                  </Tooltip>
                </ButtonGroup>

                <Menu
                  anchorEl={antennaMenuAnchor}
                  open={Boolean(antennaMenuAnchor)}
                  onClose={handleAntennaMenuClose}
                >
                  <MenuItem onClick={() => handleAntennaSelect('rod')}>
                    <ListItemIcon>
                      <CableOutlined fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rod/Wire</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => handleAntennaSelect('custom')}>
                    <ListItemIcon>
                      <Widgets fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Custom Structure</ListItemText>
                  </MenuItem>
                </Menu>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Elements Section */}
              <Box>
                <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                  Add Elements
                </Box>
                <ButtonGroup variant="outlined" size="small">
                  <Tooltip title="Add voltage source">
                    <Button
                      startIcon={<RadioButtonChecked />}
                      onClick={() => onAntennaTypeSelect?.('voltage-source')}
                    >
                      Source
                    </Button>
                  </Tooltip>
                  <Tooltip title="Add lumped element (R/L/C)">
                    <Button
                      startIcon={<Widgets />}
                      onClick={() => onAntennaTypeSelect?.('lumped-element')}
                    >
                      R/L/C
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Box>
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

              {/* Antenna Section (3D only) */}
              {selectedViewData?.viewType === '3D' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Antenna
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add all antennas as single tree item">
                        <Button
                          startIcon={<ViewInAr />}
                          onClick={handleAddAntennaSystem}
                          disabled={!selectedView}
                        >
                          Add System
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add individual antenna element">
                        <Button
                          startIcon={<Widgets />}
                          onClick={handleAddAntennaElement}
                          disabled={!selectedView}
                        >
                          Add Element
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add current distribution visualization">
                        <Button
                          startIcon={<TrendingUp />}
                          onClick={handleAddCurrentDistribution}
                          disabled={!selectedView}
                        >
                          Currents
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add voltage distribution visualization">
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddVoltageDistribution}
                          disabled={!selectedView}
                        >
                          Voltages
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
                          disabled={!selectedView}
                        >
                          Add Field
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add directivity pattern">
                        <Button
                          startIcon={<RadioButtonChecked />}
                          onClick={handleAddDirectivity}
                          disabled={!selectedView}
                        >
                          Directivity
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </Box>

                  <Divider orientation="vertical" flexItem />
                </>
              )}

              {/* Scalar Results Section (Line view only) */}
              {selectedViewData?.viewType === 'Line' && (
                <>
                  <Box>
                    <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                      Scalar Results
                    </Box>
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Add impedance vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddImpedancePlot}
                          disabled={!selectedView}
                        >
                          Impedance
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add voltage vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddVoltagePlot}
                          disabled={!selectedView}
                        >
                          Voltage
                        </Button>
                      </Tooltip>
                      <Tooltip title="Add current vs frequency plot">
                        <Button
                          startIcon={<ShowChart />}
                          onClick={handleAddCurrentPlot}
                          disabled={!selectedView}
                        >
                          Current
                        </Button>
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
                      disabled={!selectedView}
                    >
                      PDF
                    </Button>
                  </Tooltip>
                  <Tooltip title="Export field data to ParaView (VTU format)">
                    <Button
                      startIcon={<SaveAlt />}
                      onClick={handleExportParaView}
                      disabled={!selectedView}
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
    </Paper>
  );
}

export default RibbonMenu;
