import { useState } from 'react';
import { Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { generateDipole } from '@/store/designSlice';
import { showNotification } from '@/store/uiSlice';
import DesignCanvas from './DesignCanvas';
import TreeViewPanel from './TreeViewPanel';
import PropertiesPanel from './PropertiesPanel';
import RibbonMenu from './RibbonMenu';
import ViewControls from './ViewControls';
import { DipoleDialog } from './DipoleDialog';
import type { Mesh } from '@/types/models';

/**
 * DesignPage - 3D antenna design interface
 * Main workspace for creating and editing antenna geometries
 */
function DesignPage() {
  const { projectId } = useParams();
  const dispatch = useAppDispatch();
  const { mesh, meshGenerating } = useAppSelector((state) => state.design);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dipoleDialogOpen, setDipoleDialogOpen] = useState(false);

  const handleAntennaTypeSelect = (type: string) => {
    console.log('Antenna type selected:', type);
    
    // Open corresponding dialog
    switch (type.toLowerCase()) {
      case 'dipole':
        setDipoleDialogOpen(true);
        break;
      case 'loop':
        // TODO: Open LoopDialog
        dispatch(showNotification({ message: 'Loop dialog coming soon!', severity: 'info' }));
        break;
      case 'helix':
        // TODO: Open HelixDialog
        dispatch(showNotification({ message: 'Helix dialog coming soon!', severity: 'info' }));
        break;
      case 'rod':
        // TODO: Open RodDialog
        dispatch(showNotification({ message: 'Rod dialog coming soon!', severity: 'info' }));
        break;
      default:
        console.log('Unknown antenna type:', type);
    }
  };

  const handleDipoleGenerate = async (data: any) => {
    try {
      await dispatch(generateDipole(data)).unwrap();
      dispatch(showNotification({
        message: `Dipole antenna "${data.name}" generated successfully!`,
        severity: 'success',
      }));
    } catch (error: any) {
      dispatch(showNotification({
        message: error || 'Failed to generate dipole antenna',
        severity: 'error',
      }));
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleAnalysisAction = (action: string) => {
    console.log('Analysis action:', action);
    // TODO: Implement mesh generation, solver execution, etc.
  };

  const handleViewOption = (option: string) => {
    console.log('View option:', option);
    // TODO: Implement view changes (camera presets, visualization modes)
    if (option === 'toggle-grid') {
      setGridVisible(!gridVisible);
    }
  };

  const handleZoomIn = () => {
    console.log('Zoom in');
    // TODO: Control camera zoom
  };

  const handleZoomOut = () => {
    console.log('Zoom out');
    // TODO: Control camera zoom
  };

  const handleResetView = () => {
    console.log('Reset view');
    // TODO: Reset camera to default position
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <DesignCanvas
        mesh={mesh || undefined}
        leftPanel={
          <TreeViewPanel
            selectedNodeId={selectedNodeId || undefined}
            onSelectNode={setSelectedNodeId}
          />
        }
        rightPanel={
          <PropertiesPanel
            selectedElement={
              selectedNodeId
                ? {
                    id: selectedNodeId,
                    type: 'edge',
                    properties: {
                      startNode: {
                        label: 'Start Node',
                        value: '0',
                        type: 'text',
                        editable: false,
                      },
                      endNode: {
                        label: 'End Node',
                        value: '1',
                        type: 'text',
                        editable: false,
                      },
                      radius: {
                        label: 'Radius',
                        value: 0.001,
                        type: 'number',
                        unit: 'm',
                        editable: true,
                      },
                      material: {
                        label: 'Material',
                        value: 'copper',
                        type: 'select',
                        options: ['copper', 'aluminum', 'steel'],
                        editable: true,
                      },
                    },
                  }
                : null
            }
          />
        }
        topToolbar={
          <RibbonMenu
            onAntennaTypeSelect={handleAntennaTypeSelect}
            onAnalysisAction={handleAnalysisAction}
            onViewOption={handleViewOption}
          />
        }
      />
      <ViewControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onToggleGrid={() => handleViewOption('toggle-grid')}
        onToggleFullscreen={handleToggleFullscreen}
        gridVisible={gridVisible}
        isFullscreen={isFullscreen}
      />
      
      {/* Antenna Configuration Dialogs */}
      <DipoleDialog
        open={dipoleDialogOpen}
        onClose={() => setDipoleDialogOpen(false)}
        onGenerate={handleDipoleGenerate}
      />
    </Box>
  );
}

export default DesignPage;

