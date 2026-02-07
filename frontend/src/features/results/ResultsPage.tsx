import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchProject } from '@/store/projectsSlice';
import SolutionDataPanel from './SolutionDataPanel';
import ResultsVisualizationPanel from './ResultsVisualizationPanel';

/**
 * ResultsPage - Dedicated full-screen results visualization
 * 
 * Layout:
 * - Header: Back button, project name, export menu
 * - Left panel (250-300px): Solution data (currents, voltages, fields)
 * - Main area: Visualizations (3D, charts, patterns)
 */
function ResultsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Redux state
  const project = useAppSelector((state) => 
    state.projects.items.find(p => p.id === Number(projectId))
  );
  const { mesh } = useAppSelector((state) => state.design);
  const { results, currentDistribution, radiationPattern } = useAppSelector((state) => state.solver);
  const loading = useAppSelector((state) => state.projects.loading);

  // Local state
  const [selectedFrequency, setSelectedFrequency] = useState(0);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'charts' | 'pattern'>('3d');

  // Load project on mount
  useEffect(() => {
    if (projectId && !project) {
      dispatch(fetchProject(projectId));
    }
  }, [projectId, project, dispatch]);

  // Check if we have results
  const hasResults = results && currentDistribution && currentDistribution.length > 0;

  // Handle back navigation
  const handleBack = () => {
    navigate(`/project/${projectId}/design`);
  };

  // Handle export menu
  const handleExportClick = (event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget);
  };

  const handleExportClose = () => {
    setExportMenuAnchor(null);
  };

  const handleExportCSV = () => {
    console.log('Export CSV');
    handleExportClose();
    // TODO: Implement CSV export
  };

  const handleExportJSON = () => {
    console.log('Export JSON');
    handleExportClose();
    // TODO: Implement JSON export
  };

  const handleExportPNG = () => {
    console.log('Export PNG');
    handleExportClose();
    // TODO: Implement PNG export
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // No results state
  if (!hasResults) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Header */}
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar>
            <IconButton edge="start" onClick={handleBack} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Results: {project?.name || 'Untitled Project'}
            </Typography>
          </Toolbar>
        </AppBar>

        {/* No results message */}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 4 }}>
          <Alert severity="info">
            <Typography variant="h6" gutterBottom>
              No Results Available
            </Typography>
            <Typography variant="body2">
              Run a simulation from the Design page to see results here.
            </Typography>
            <Button 
              variant="contained" 
              onClick={handleBack}
              sx={{ mt: 2 }}
            >
              Go to Design
            </Button>
          </Alert>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" onClick={handleBack} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Results: {project?.name || 'Untitled Project'}
          </Typography>
          <Button
            startIcon={<DownloadIcon />}
            onClick={handleExportClick}
            variant="outlined"
          >
            Export
          </Button>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={handleExportClose}
          >
            <MenuItem onClick={handleExportCSV}>Export CSV</MenuItem>
            <MenuItem onClick={handleExportJSON}>Export JSON</MenuItem>
            <MenuItem onClick={handleExportPNG}>Export PNG</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Main content: Two-panel layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: Solution data */}
        <SolutionDataPanel
          results={results}
          currentDistribution={currentDistribution}
          radiationPattern={radiationPattern}
          mesh={mesh}
          selectedFrequency={selectedFrequency}
          onFrequencyChange={setSelectedFrequency}
        />

        {/* Main panel: Visualizations */}
        <ResultsVisualizationPanel
          results={results}
          currentDistribution={currentDistribution}
          radiationPattern={radiationPattern}
          mesh={mesh}
          selectedFrequency={selectedFrequency}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Box>
    </Box>
  );
}

export default ResultsPage;
