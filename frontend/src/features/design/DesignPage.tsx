import { useState } from 'react';
import { Box } from '@mui/material';
// import { useParams } from 'react-router-dom'; // TODO: Use when needed
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { 
  generateDipole, 
  generateLoop, 
  generateHelix, 
  generateRod, 
  addLumpedElement,
  setSelectedElement,
  setElementColor,
  setElementPosition,
  setElementRotation,
  updateElement,
  removeElement,
  duplicateElement,
  setElementVisibility,
  setElementLocked,
} from '@/store/designSlice';
import { addNotification } from '@/store/uiSlice';
import { runMultiAntennaSimulation } from '@/store/solverSlice';
import {
  buildMultiAntennaRequest,
  countSimulationReadyElements,
  validateHasSources,
  getSimulationComplexity,
} from '@/utils/multiAntennaBuilder';
import DesignCanvas from './DesignCanvas';
import TreeViewPanel from './TreeViewPanel';
import PropertiesPanel from './PropertiesPanel';
import RibbonMenu from './RibbonMenu';
import ViewControls from './ViewControls';
import { DipoleDialog } from './DipoleDialog';
import { LoopDialog } from './LoopDialog';
import { HelixDialog } from './HelixDialog';
import { RodDialog } from './RodDialog';
import { LumpedElementDialog } from './LumpedElementDialog';
import { addLumpedElementToMesh } from '@/api/preprocessor';


/**
 * DesignPage - 3D antenna design interface
 * Main workspace for creating and editing antenna geometries
 */
function DesignPage() {
  // const { projectId } = useParams(); // TODO: Use projectId when needed
  const dispatch = useAppDispatch();
  const { 
    elements, 
    selectedElementId, 
    mesh, 
    sources, 
    lumpedElements, 
    antennaType, 
    meshGenerating 
  } = useAppSelector(
    (state) => state.design
  );
  
  const { 
    status: solverStatus, 
    progress: solverProgress,
    currentDistribution 
  } = useAppSelector(
    (state) => state.solver
  );
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dipoleDialogOpen, setDipoleDialogOpen] = useState(false);
  const [loopDialogOpen, setLoopDialogOpen] = useState(false);
  const [helixDialogOpen, setHelixDialogOpen] = useState(false);
  const [rodDialogOpen, setRodDialogOpen] = useState(false);
  const [lumpedDialogOpen, setLumpedDialogOpen] = useState(false);

  const handleAntennaTypeSelect = (type: string) => {
    console.log('Antenna type selected:', type);
    
    // Open corresponding dialog
    switch (type.toLowerCase()) {
      case 'dipole':
        setDipoleDialogOpen(true);
        break;
      case 'loop':
        setLoopDialogOpen(true);
        break;
      case 'helix':
        setHelixDialogOpen(true);
        break;
      case 'rod':
        setRodDialogOpen(true);
        break;
      case 'lumped-element':
        setLumpedDialogOpen(true);
        break;
      default:
        console.log('Unknown antenna type:', type);
    }
  };

  const handleDipoleGenerate = async (data: any) => {
    try {
      await dispatch(generateDipole(data)).unwrap();
      dispatch(addNotification({
        id: Date.now(),
        message: `Dipole antenna "${data.name}" generated successfully!`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to generate dipole antenna',
        severity: 'error',
        duration: 5000,
      }));
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleLoopGenerate = async (data: any) => {
    try {
      await dispatch(generateLoop(data)).unwrap();
      dispatch(addNotification({
        id: Date.now(),
        message: `Loop antenna "${data.name}" generated successfully!`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to generate loop antenna',
        severity: 'error',
        duration: 5000,
      }));
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleHelixGenerate = async (data: any) => {
    try {
      await dispatch(generateHelix(data)).unwrap();
      dispatch(addNotification({
        id: Date.now(),
        message: `Helix antenna generated successfully!`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to generate helix antenna',
        severity: 'error',
        duration: 5000,
      }));
      throw error;
    }
  };

  const handleRodGenerate = async (data: any) => {
    try {
      await dispatch(generateRod(data)).unwrap();
      dispatch(addNotification({
        id: Date.now(),
        message: `Rod generated successfully!`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to generate rod',
        severity: 'error',
        duration: 5000,
      }));
      throw error;
    }
  };

  const handleAddLumpedElement = async (data: any) => {
    try {
      const element = await addLumpedElementToMesh(data);
      dispatch(addLumpedElement(element));
      dispatch(addNotification({
        id: Date.now(),
        message: 'Lumped element added to mesh',
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to add lumped element',
        severity: 'error',
        duration: 5000,
      }));
      throw error;
    }
  };

  // Element selection handler
  const handleElementSelect = (elementId: string) => {
    console.log('Element selected:', elementId);
    dispatch(setSelectedElement(elementId));
  };

  // Color change handler
  const handleColorChange = (elementId: string, color: string) => {
    console.log('Color changed:', elementId, color);
    dispatch(setElementColor({ id: elementId, color }));
  };

  // Position change handler
  const handlePositionChange = (elementId: string, position: [number, number, number]) => {
    console.log('Position changed:', elementId, position);
    dispatch(setElementPosition({ id: elementId, position }));
  };

  // Rotation change handler
  const handleRotationChange = (elementId: string, rotation: [number, number, number]) => {
    console.log('Rotation changed:', elementId, rotation);
    dispatch(setElementRotation({ id: elementId, rotation }));
  };

  // Element management handlers
  const handleElementRename = (elementId: string, newName: string) => {
    dispatch(updateElement({ id: elementId, updates: { name: newName } }));
    dispatch(addNotification({
      id: Date.now(),
      message: `Element renamed to "${newName}"`,
      severity: 'success',
      duration: 3000,
    }));
  };

  const handleElementDuplicate = (elementId: string) => {
    dispatch(duplicateElement(elementId));
    dispatch(addNotification({
      id: Date.now(),
      message: 'Element duplicated',
      severity: 'success',
      duration: 3000,
    }));
  };

  const handleElementDelete = (elementId: string) => {
    dispatch(removeElement(elementId));
    dispatch(addNotification({
      id: Date.now(),
      message: 'Element deleted',
      severity: 'success',
      duration: 3000,
    }));
  };

  const handleElementLock = (elementId: string, locked: boolean) => {
    dispatch(setElementLocked({ id: elementId, locked }));
  };

  const handleElementVisibilityToggle = (elementId: string, visible: boolean) => {
    dispatch(setElementVisibility({ id: elementId, visible }));
  };

  const handleAnalysisAction = async (action: string) => {
    console.log('Analysis action:', action);
    
    if (action === 'run-solver') {
      // Check if we have elements
      if (!elements || elements.length === 0) {
        dispatch(addNotification({
          id: Date.now(),
          message: 'No antenna elements. Please create an antenna first.',
          severity: 'warning',
          duration: 5000,
        }));
        return;
      }

      // Count simulation-ready elements
      const readyCount = countSimulationReadyElements(elements);
      if (readyCount === 0) {
        dispatch(addNotification({
          id: Date.now(),
          message: 'No valid elements for simulation. Ensure elements are visible, unlocked, and have meshes.',
          severity: 'warning',
          duration: 5000,
        }));
        return;
      }

      // Validate at least one element has a source
      if (!validateHasSources(elements)) {
        dispatch(addNotification({
          id: Date.now(),
          message: 'No voltage source defined. At least one element must have a source to run simulation.',
          severity: 'warning',
          duration: 5000,
        }));
        return;
      }

      // Get simulation complexity for progress estimation
      const complexity = getSimulationComplexity(elements);
      console.log('Simulation complexity:', complexity);

      // Default frequency (300 MHz)
      const frequency = 300e6;

      try {
        // Build multi-antenna request
        const request = buildMultiAntennaRequest(elements, frequency);

        dispatch(addNotification({
          id: Date.now(),
          message: `Running simulation: ${readyCount} element(s), ${complexity.totalEdges} edge(s) at ${(frequency / 1e6).toFixed(0)} MHz...`,
          severity: 'info',
          duration: 3000,
        }));

        // Run multi-antenna simulation
        await dispatch(runMultiAntennaSimulation(request)).unwrap();

        dispatch(addNotification({
          id: Date.now(),
          message: `Simulation completed successfully! ${readyCount} antenna(s) solved.`,
          severity: 'success',
          duration: 5000,
        }));
      } catch (error: any) {
        dispatch(addNotification({
          id: Date.now(),
          message: `Simulation failed: ${error}`,
          severity: 'error',
          duration: 7000,
        }));
      }
    } else if (action === 'view-results') {
      console.log('View results');
    } else if (action === 'generate-mesh') {
      dispatch(addNotification({
        id: Date.now(),
        message: 'Mesh is automatically generated when antenna is created.',
        severity: 'info',
        duration: 4000,
      }));
    }
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <DesignCanvas
        elements={elements}
        selectedElementId={selectedElementId}
        onElementSelect={handleElementSelect}
        mesh={mesh || undefined} // Keep for backward compatibility
        currentDistribution={currentDistribution || undefined} // Pass solver results
        leftPanel={
          <TreeViewPanel
            elements={elements}
            selectedElementId={selectedElementId}
            onElementSelect={handleElementSelect}
            onElementDelete={handleElementDelete}
            onElementDuplicate={handleElementDuplicate}
            onElementRename={handleElementRename}
            onElementLock={handleElementLock}
            onElementVisibilityToggle={handleElementVisibilityToggle}
            // Legacy props for backward compatibility
            mesh={mesh || undefined}
            sources={sources}
            lumpedElements={lumpedElements}
            antennaType={antennaType ? `${antennaType.charAt(0).toUpperCase()}${antennaType.slice(1)} Antenna` : 'Antenna'}
            selectedNodeId={selectedNodeId || undefined}
            onSelectNode={setSelectedNodeId}
          />
        }
        rightPanel={
          <PropertiesPanel
            antennaElement={
              selectedElementId
                ? elements?.find(el => el.id === selectedElementId)
                : undefined
            }
            onColorChange={handleColorChange}
            onPositionChange={handlePositionChange}
            onRotationChange={handleRotationChange}
            selectedElement={
              selectedNodeId && !selectedElementId
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
            solverStatus={solverStatus}
            solverProgress={solverProgress}
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
      <LoopDialog
        open={loopDialogOpen}
        onClose={() => setLoopDialogOpen(false)}
        onGenerate={handleLoopGenerate}
      />
      <HelixDialog
        open={helixDialogOpen}
        onClose={() => setHelixDialogOpen(false)}
        onGenerate={handleHelixGenerate}
        loading={meshGenerating}
      />
      <RodDialog
        open={rodDialogOpen}
        onClose={() => setRodDialogOpen(false)}
        onGenerate={handleRodGenerate}
        loading={meshGenerating}
      />
      <LumpedElementDialog
        open={lumpedDialogOpen}
        onClose={() => setLumpedDialogOpen(false)}
        onAdd={handleAddLumpedElement}
        loading={false}
        maxNodeIndex={mesh?.nodes ? mesh.nodes.length - 1 : 0}
      />
    </Box>
  );
}

export default DesignPage;

