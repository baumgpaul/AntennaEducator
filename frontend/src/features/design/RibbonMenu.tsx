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
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleVisualizationMode } from '@/store/uiSlice';

interface RibbonMenuProps {
  onAntennaTypeSelect?: (type: string) => void;
  onAnalysisAction?: (action: string) => void;
  onViewOption?: (option: string) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
  solverProgress?: number;
}

/**
 * RibbonMenu - Top toolbar with antenna and element creation actions
 * Simplified for Designer tab - focused on geometry creation only
 */
function RibbonMenu({ onAntennaTypeSelect, onAnalysisAction, onViewOption, solverStatus = 'idle', solverProgress = 0 }: RibbonMenuProps) {
  const dispatch = useAppDispatch();
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);
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

  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, bgcolor: 'background.paper' }}>
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
          </Box>
        </Box>
      </Paper>
    );
  }

export default RibbonMenu;
