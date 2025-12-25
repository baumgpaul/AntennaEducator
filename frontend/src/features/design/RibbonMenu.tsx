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
  Visibility,
  Settings,
  ExpandMore,
  ColorLens,
  TrendingUp,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleVisualizationMode } from '@/store/uiSlice';

interface RibbonMenuProps {
  onAntennaTypeSelect?: (type: string) => void;
  onAnalysisAction?: (action: string) => void;
  onViewOption?: (option: string) => void;
}

/**
 * RibbonMenu - Top toolbar with categorized actions
 * Similar to Microsoft Office ribbon interface
 */
function RibbonMenu({ onAntennaTypeSelect, onAnalysisAction, onViewOption }: RibbonMenuProps) {
  const dispatch = useAppDispatch();
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);
  const [currentTab, setCurrentTab] = useState(0);
  const [antennaMenuAnchor, setAntennaMenuAnchor] = useState<null | HTMLElement>(null);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

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

  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{
          minHeight: 40,
          bgcolor: 'background.default',
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none' },
        }}
      >
        <Tab label="Antenna" />
        <Tab label="Analysis" />
        <Tab label="View" />
      </Tabs>

      <Box sx={{ p: 1.5, minHeight: 80, bgcolor: 'background.paper' }}>
        {/* Antenna Tab */}
        {currentTab === 0 && (
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
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
                Elements
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
                    Load
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>
          </Box>
        )}

        {/* Analysis Tab */}
        {currentTab === 1 && (
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            {/* Mesh Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                Mesh
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title="Generate mesh">
                  <Button onClick={() => onAnalysisAction?.('generate-mesh')}>
                    Generate Mesh
                  </Button>
                </Tooltip>
                <Tooltip title="Mesh settings">
                  <Button startIcon={<Settings />} onClick={() => onAnalysisAction?.('mesh-settings')}>
                    Settings
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Simulation Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                Simulation
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title="Run solver">
                  <Button
                    startIcon={<PlayArrow />}
                    onClick={() => onAnalysisAction?.('run-solver')}
                    color="primary"
                  >
                    Solve
                  </Button>
                </Tooltip>
                <Tooltip title="Solver configuration">
                  <Button startIcon={<Settings />} onClick={() => onAnalysisAction?.('solver-settings')}>
                    Configure
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Results Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                Results
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title="View results">
                  <Button
                    startIcon={<Assessment />}
                    onClick={() => onAnalysisAction?.('view-results')}
                  >
                    View
                  </Button>
                </Tooltip>
                <Tooltip title="Export results">
                  <Button onClick={() => onAnalysisAction?.('export-results')}>
                    Export
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>
          </Box>
        )}

        {/* View Tab */}
        {currentTab === 2 && (
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            {/* Display Options Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                Display
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title="Show/hide grid">
                  <Button onClick={() => onViewOption?.('toggle-grid')}>
                    Grid
                  </Button>
                </Tooltip>
                <Tooltip title="Show/hide axes">
                  <Button onClick={() => onViewOption?.('toggle-axes')}>
                    Axes
                  </Button>
                </Tooltip>
                <Tooltip title="Show/hide nodes">
                  <Button onClick={() => onViewOption?.('toggle-nodes')}>
                    Nodes
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* View Presets Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                View Presets
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title="Top view">
                  <Button onClick={() => onViewOption?.('view-top')}>
                    Top
                  </Button>
                </Tooltip>
                <Tooltip title="Front view">
                  <Button onClick={() => onViewOption?.('view-front')}>
                    Front
                  </Button>
                </Tooltip>
                <Tooltip title="Side view">
                  <Button onClick={() => onViewOption?.('view-side')}>
                    Side
                  </Button>
                </Tooltip>
                <Tooltip title="Isometric view">
                  <Button onClick={() => onViewOption?.('view-iso')}>
                    Iso
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Visualization Section */}
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                Visualization
              </Box>
              <ButtonGroup variant="outlined" size="small">
                <Tooltip title={
                  visualizationMode === 'element-colors' 
                    ? 'Switch to current distribution' 
                    : 'Switch to element colors'
                }>
                  <Button
                    startIcon={visualizationMode === 'element-colors' ? <ColorLens /> : <TrendingUp />}
                    onClick={handleToggleVisualizationMode}
                    variant={visualizationMode === 'element-colors' ? 'contained' : 'outlined'}
                  >
                    {visualizationMode === 'element-colors' ? 'Colors' : 'Current'}
                  </Button>
                </Tooltip>
                <Tooltip title="Field visualization">
                  <Button onClick={() => onViewOption?.('show-field')}>
                    Fields
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default RibbonMenu;
