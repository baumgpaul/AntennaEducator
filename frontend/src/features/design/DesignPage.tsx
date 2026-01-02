import { useState, useEffect, useRef } from 'react';
import { Box, Snackbar, Alert, Tabs, Tab, Typography } from '@mui/material';
import { debounce } from 'lodash';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { 
  generateDipole, 
  generateLoop, 
  generateHelix, 
  generateRod, 
  addLumpedElement,
  addLumpedElementToElement,
  addSource,
  addSourceToElement,
  setSelectedElement,
  setElementColor,
  setElementPosition,
  setElementRotation,
  updateElement,
  removeElement,
  duplicateElement,
  setElementVisibility,
  setElementLocked,
  loadDesign,
} from '@/store/designSlice';
import { updateProject, fetchProject } from '@/store/projectsSlice';
import { addNotification } from '@/store/uiSlice';
import { runMultiAntennaSimulation, computeRadiationPattern, runFrequencySweep, selectRequestedFields, selectDirectivityRequested, selectSolverState, setFieldDefinitions } from '@/store/solverSlice';
import type { FrequencySweepParams, MultiAntennaRequest } from '@/types/api';
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
import { SourceDialog } from './SourceDialog';
import { FrequencySweepDialog } from './FrequencySweepDialog';
import ResultsPanel from './ResultsPanel';
import { SolverTab } from './SolverTab';
import PostprocessingTab from './PostprocessingTab';
import { addLumpedElementToMesh, addSourceToMesh } from '@/api/preprocessor';


/**
 * DesignPage - 3D antenna design interface
 * Main workspace for creating and editing antenna geometries
 */
function DesignPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
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
    currentDistribution,
    results,
    radiationPattern,
  } = useAppSelector(
    (state) => state.solver
  );
  
  const requestedFields = useAppSelector(selectRequestedFields);
  const directivityRequested = useAppSelector(selectDirectivityRequested);
  const solverWorkflowState = useAppSelector(selectSolverState);
  const fieldResults = useAppSelector((state) => state.solver.fieldResults);
  const currentFrequency = useAppSelector((state) => state.solver.currentFrequency);
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const fieldData = useAppSelector((state) => state.solver.fieldData);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [dipoleDialogOpen, setDipoleDialogOpen] = useState(false);
  const [loopDialogOpen, setLoopDialogOpen] = useState(false);
  const [helixDialogOpen, setHelixDialogOpen] = useState(false);
  const [rodDialogOpen, setRodDialogOpen] = useState(false);
  const [lumpedDialogOpen, setLumpedDialogOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [frequencySweepDialogOpen, setFrequencySweepDialogOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previousElementCountRef = useRef<number>(0);
  const [triggerSave, setTriggerSave] = useState(0);
  const [currentTab, setCurrentTab] = useState<'designer' | 'solver' | 'postprocessing'>('designer');

  const handleTabChange = (_: unknown, newValue: 'designer' | 'solver' | 'postprocessing') => {
    if (newValue === 'postprocessing' && solverWorkflowState === 'idle') {
      return;
    }
    setCurrentTab(newValue);
  };

  // Get current project from Redux to detect when it loads
  const currentProject = useAppSelector((state) => state.projects.currentProject);

  // Load project on mount if projectId exists
  useEffect(() => {
    if (projectId) {
      dispatch(fetchProject(projectId));
    }
  }, [projectId, dispatch]);

  // Parse and restore design elements from project description
  useEffect(() => {
    if (!currentProject) return;

    // Load requested fields from project
    if (currentProject.requested_fields && Array.isArray(currentProject.requested_fields)) {
      console.log('Loading requested fields from project:', currentProject.requested_fields);
      dispatch(setFieldDefinitions(currentProject.requested_fields));
    } else {
      // No requested fields - clear any existing ones
      dispatch(setFieldDefinitions([]));
    }

    // If project has JSON description, parse and restore elements
    if (currentProject.description && currentProject.description.startsWith('[')) {
      try {
        const designElements = JSON.parse(currentProject.description);
        console.log('Restored design elements from project:', designElements);
        // Dispatch action to load elements into design state
        if (Array.isArray(designElements) && designElements.length > 0) {
          dispatch(loadDesign({ elements: designElements }));
        } else {
          // Empty array in description - clear design
          dispatch(loadDesign({ elements: [] }));
        }
      } catch (error) {
        console.error('Failed to parse design elements from project description:', error);
        // On parse error, clear design to prevent showing old elements
        dispatch(loadDesign({ elements: [] }));
      }
    } else {
      // No description or non-JSON description - this is an empty project, clear design
      console.log('Empty project loaded, clearing design state');
      dispatch(loadDesign({ elements: [] }));
    }
  }, [currentProject?.id, dispatch]); // Only re-run when project ID changes

  // Auto-save function with retry logic (debounced)
  const saveProjectDebounced = useRef(
    debounce(async (projectElements: typeof elements, fields: any[], retryCount = 0) => {
      if (!projectId) {
        return;
      }

      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

      try {
        setSaveStatus('saving');
        setShowSaveIndicator(true);
        setSaveError(null);

        // Save project elements and requested fields to backend
        await dispatch(updateProject({
          id: projectId,
          data: {
            // Store elements as JSON in description field
            description: JSON.stringify(projectElements),
            // Store requested fields in dedicated column
            requested_fields: fields,
          },
        })).unwrap();
        
        console.log('Auto-saved project with', projectElements.length, 'elements and', fields.length, 'fields');
        
        setSaveStatus('saved');
        
        // Hide indicator after 2 seconds
        setTimeout(() => {
          setShowSaveIndicator(false);
          setSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error(`Auto-save failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
        
        if (retryCount < MAX_RETRIES) {
          // Retry after delay
          const delay = RETRY_DELAYS[retryCount];
          setSaveStatus('saving');
          setSaveError(`Retrying in ${delay / 1000}s...`);
          
          setTimeout(() => {
            saveProjectDebounced(projectElements, fields, retryCount + 1);
          }, delay);
        } else {
          // All retries failed
          setSaveStatus('error');
          setSaveError('Failed to save changes. Please check your connection.');
          
          // Keep error visible longer
          setTimeout(() => {
            setShowSaveIndicator(false);
            setSaveStatus('idle');
            setSaveError(null);
          }, 5000);
        }
      }
    }, 1500) // 1.5 second debounce
  ).current;

  // Auto-save when elements change due to property updates
  useEffect(() => {
    if (triggerSave > 0 && projectId && elements.length > 0) {
      console.log('Triggering auto-save after property change, elements:', elements);
      saveProjectDebounced(elements, requestedFields);
    }
  }, [triggerSave, projectId, elements, requestedFields, saveProjectDebounced]);

  // Auto-save on element addition only (not on every property change)
  useEffect(() => {
    // Only save if new elements were added (count increased)
    if (elements && elements.length > previousElementCountRef.current) {
      console.log(`New element(s) added: ${previousElementCountRef.current} -> ${elements.length}, saving...`);
      previousElementCountRef.current = elements.length;
      saveProjectDebounced(elements, requestedFields);
    } else if (elements && elements.length < previousElementCountRef.current) {
      // Update count if elements were removed
      previousElementCountRef.current = elements.length;
    }

    // Cleanup debounce on unmount
    return () => {
      saveProjectDebounced.cancel();
    };
  }, [elements?.length]); // Only depend on length, not full array

  // Auto-save when requested fields change
  useEffect(() => {
    if (projectId && (elements.length > 0 || requestedFields.length > 0)) {
      console.log('Requested fields changed, saving...');
      saveProjectDebounced(elements, requestedFields);
    }
  }, [requestedFields, projectId, elements, saveProjectDebounced]);

  // Reset element count when opening a different project
  useEffect(() => {
    if (currentProject?.id) {
      previousElementCountRef.current = elements.length;
    }
  }, [currentProject?.id]);

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
      case 'voltage-source':
        setSourceDialogOpen(true);
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
      
      // Check if antennaId is provided (for multi-antenna mode)
      if (data.antennaId) {
        dispatch(addLumpedElementToElement({ 
          elementId: data.antennaId, 
          lumpedElement: element 
        }));
      } else {
        // Fallback to global array for backward compatibility
        dispatch(addLumpedElement(element));
      }
      
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

  const handleAddSource = async (data: any) => {
    try {
      const source = await addSourceToMesh(data);
      
      // Check if antennaId is provided (for multi-antenna mode)
      if (data.antennaId) {
        dispatch(addSourceToElement({ 
          elementId: data.antennaId, 
          source 
        }));
      } else {
        // Fallback to global array for backward compatibility
        dispatch(addSource(source));
      }
      
      dispatch(addNotification({
        id: Date.now(),
        message: `${data.type === 'voltage' ? 'Voltage' : 'Current'} source added successfully`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to add source',
        severity: 'error',
        duration: 5000,
      }));
      throw error;
    }
  };
  // Element selection handler
  const handleElementSelect = (elementId: string) => {
    console.log('Element selected:', elementId);
    console.log('Current elements:', elements);
    console.log('Found element:', elements?.find(el => el.id === elementId));
    dispatch(setSelectedElement(elementId));
  };

  // Color change handler
  const handleColorChange = (elementId: string, color: string) => {
    console.log('Color changed:', elementId, color);
    dispatch(setElementColor({ id: elementId, color }));
    // Trigger auto-save after state update
    setTriggerSave(prev => prev + 1);
  };

  // Position change handler
  const handlePositionChange = (elementId: string, position: [number, number, number]) => {
    console.log('Position changed:', elementId, position);
    dispatch(setElementPosition({ id: elementId, position }));
    // Trigger auto-save after state update
    setTriggerSave(prev => prev + 1);
  };

  // Rotation change handler
  const handleRotationChange = (elementId: string, rotation: [number, number, number]) => {
    console.log('Rotation changed:', elementId, rotation);
    dispatch(setElementRotation({ id: elementId, rotation }));
    // Trigger auto-save after state update
    setTriggerSave(prev => prev + 1);
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

        // Compute far-field radiation pattern
        try {
          await dispatch(computeRadiationPattern()).unwrap();
          console.log('Radiation pattern computed successfully');
        } catch (patternError) {
          console.warn('Failed to compute radiation pattern:', patternError);
          // Don't show error notification for pattern computation failure
        }

        // Auto-open results panel on successful simulation
        setShowResultsPanel(true);

        // Navigate to results page after a short delay
        setTimeout(() => {
          if (projectId) {
            navigate(`/project/${projectId}/results`);
          }
        }, 1500);
      } catch (error: any) {
        dispatch(addNotification({
          id: Date.now(),
          message: `Simulation failed: ${error}`,
          severity: 'error',
          duration: 7000,
        }));
      }
    } else if (action === 'view-results') {
      // Navigate to dedicated results page
      if (projectId && results) {
        navigate(`/project/${projectId}/results`);
      } else {
        dispatch(addNotification({
          id: Date.now(),
          message: 'No results available. Run a simulation first.',
          severity: 'info',
          duration: 4000,
        }));
      }
    } else if (action === 'frequency-sweep') {
      // Open frequency sweep dialog
      setFrequencySweepDialogOpen(true);
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

  const handleFrequencySweep = async (params: FrequencySweepParams) => {
    console.log('Starting frequency sweep:', params);

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

    try {
      // Build base multi-antenna request (without frequency)
      const baseRequest = buildMultiAntennaRequest(elements, params.startFrequency) as MultiAntennaRequest;
      
      // Remove frequency field since sweep will add it per-iteration
      const { frequency: _, ...requestWithoutFreq } = baseRequest;

      dispatch(addNotification({
        id: Date.now(),
        message: `Starting frequency sweep: ${params.numPoints} points from ${(params.startFrequency / 1e6).toFixed(1)} to ${(params.stopFrequency / 1e6).toFixed(1)} MHz...`,
        severity: 'info',
        duration: 3000,
      }));

      // Close dialog
      setFrequencySweepDialogOpen(false);

      // Run frequency sweep
      await dispatch(runFrequencySweep({
        params,
        request: requestWithoutFreq as MultiAntennaRequest,
      })).unwrap();

      dispatch(addNotification({
        id: Date.now(),
        message: `Frequency sweep completed successfully! ${params.numPoints} frequencies solved.`,
        severity: 'success',
        duration: 5000,
      }));

      // Auto-open results panel
      setShowResultsPanel(true);
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: `Frequency sweep failed: ${error}`,
        severity: 'error',
        duration: 7000,
      }));
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
      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="design workspace tabs"
        >
          <Tab label="Designer" value="designer" />
          <Tab label="Solver" value="solver" />
          <Tab label="Postprocessing" value="postprocessing" disabled={solverWorkflowState === 'idle'} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {currentTab === 'designer' && (
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
            antennaElement={(() => {
              const found = selectedElementId
                ? elements?.find(el => el.id === selectedElementId)
                : undefined;
              console.log('PropertiesPanel - selectedElementId:', selectedElementId);
              console.log('PropertiesPanel - elements:', elements);
              console.log('PropertiesPanel - found element:', found);
              return found;
            })()}
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
        bottomPanel={
          <ResultsPanel
            onClose={() => setShowResultsPanel(false)}
            impedance={results?.input_impedance}
            currentDistribution={currentDistribution || undefined}
            radiationPattern={radiationPattern || undefined}
            isLoadingPattern={false}
          />
        }
        showResultsPanel={showResultsPanel}
      />
      )}

      {/* Solver Tab */}
      {currentTab === 'solver' && (
        <SolverTab
          elements={elements}
          selectedElementId={selectedElementId}
          onElementSelect={handleElementSelect}
          onElementVisibilityToggle={handleElementVisibilityToggle}
          solverStatus={solverStatus}
        />
      )}

      {/* Postprocessing Tab (placeholder) */}
      {currentTab === 'postprocessing' && (
        <PostprocessingTab
          solverState={solverWorkflowState}
          elements={elements}
          requestedFields={requestedFields}
          directivityRequested={directivityRequested}
          fieldResults={fieldResults}
          currentFrequency={currentFrequency}
          frequencySweep={frequencySweep}
          fieldData={fieldData}
        />
      )}

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
        elements={elements}
      />
      <SourceDialog
        open={sourceDialogOpen}
        onClose={() => setSourceDialogOpen(false)}
        onAdd={handleAddSource}
        loading={false}
        maxNodeIndex={mesh?.nodes ? mesh.nodes.length - 1 : 0}
        elements={elements}
      />
      <FrequencySweepDialog
        open={frequencySweepDialogOpen}
        onClose={() => setFrequencySweepDialogOpen(false)}
        onSubmit={handleFrequencySweep}
        isLoading={solverStatus === 'running' || solverStatus === 'preparing'}
      />
      
      {/* Auto-save indicator */}
      <Snackbar
        open={showSaveIndicator}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ mb: 2, mr: 2 }}
      >
        <Alert
          severity={saveStatus === 'saved' ? 'success' : saveStatus === 'error' ? 'error' : 'info'}
          variant="filled"
          sx={{ minWidth: 250 }}
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && '✓ Project saved'}
          {saveStatus === 'error' && saveError && saveError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default DesignPage;

