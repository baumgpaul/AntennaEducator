import { useState, useEffect, useRef } from 'react';
import { Box, Snackbar, Alert, Tabs, Tab, IconButton, Tooltip, Button } from '@mui/material';
import { Description as DescriptionIcon, Lock as LockIcon, ArrowBack as BackIcon } from '@mui/icons-material';
import { debounce } from 'lodash';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { parseApiError } from '@/utils/errors';
import {
  generateDipole,
  generateLoop,
  generateRod,
  generateCustom,
  remeshElementOrientation,
  remeshElementExpressions,
  addLumpedElement,
  addLumpedElementToElement,
  addSource,
  addSourceToElement,
  updateElementSource,
  setSelectedElement,
  setElementCircuit,
  setElementColor,
  setElementPosition,
  setElementRotation,
  updateElement,
  removeElement,
  duplicateElement,
  setElementVisibility,
  setElementLocked,
  loadDesign,
  markAsSolved,
} from '@/store/designSlice';
import { updateProject, fetchProject, clearCurrentProject } from '@/store/projectsSlice';
import { addNotification, showSuccess } from '@/store/uiSlice';
import { runMultiAntennaSimulation, computeRadiationPattern, runFrequencySweep, selectRequestedFields, selectDirectivityRequested, selectSolverState, setFieldDefinitions, loadSolverState, resetSolver } from '@/store/solverSlice';
import { loadViewConfigurations, clearViewConfigurations } from '@/store/postprocessingSlice';
import type { FrequencySweepParams, MultiAntennaRequest } from '@/types/api';
import type { Source } from '@/types/models';
import {
  buildMultiAntennaRequest,
  countSimulationReadyElements,
  validateHasSources,
  validateGeometry,
  getSimulationComplexity,
} from '@/utils/multiAntennaBuilder';
import DesignCanvas from './DesignCanvas';
import TreeViewPanel from './TreeViewPanel';
import PropertiesPanel from './PropertiesPanel';
import RibbonMenu from './RibbonMenu';
import type { Scene3DHandle } from './Scene3D';
import { DipoleDialog } from './DipoleDialog';
import { LoopDialog } from './LoopDialog';
import { RodDialog } from './RodDialog';
import { CustomAntennaDialog } from './CustomAntennaDialog';
import { LumpedElementDialog } from './LumpedElementDialog';
import { SourceDialog } from './SourceDialog';
import { FrequencySweepDialog } from './FrequencySweepDialog';
import { CircuitEditor } from './circuit';
import ResultsPanel from './ResultsPanel';
import { SolverTab } from './SolverTab';
import PostprocessingTab from './PostprocessingTab';
import AddViewDialog from './dialogs/AddViewDialog';
import AddAntennaElementDialog from './dialogs/AddAntennaElementDialog';
import AddFieldVisualizationDialog from './dialogs/AddFieldVisualizationDialog';
import AddScalarPlotDialog from './dialogs/AddScalarPlotDialog';
import DocumentationPanel from './DocumentationPanel';
import SubmitDialog from './dialogs/SubmitDialog';
import { togglePanel as toggleDocPanel, closePanel as closeDocPanel, clearDocumentation } from '@/store/documentationSlice';
import { selectVariables, setVariables, resetVariables } from '@/store/variablesSlice';
import { fetchFolders } from '@/store/foldersSlice';
import { submitProject as submitProjectThunk, selectSubmitLoading, selectSubmissionsError } from '@/store/submissionsSlice';
import type { VariableDefinition } from '@/utils/expressionEvaluator';
import {
  BUILTIN_CONSTANTS,
  parseNumericOrExpression,
  evaluateVariableContextNumeric,
} from '@/utils/expressionEvaluator';
import { addLumpedElementToMesh, addSourceToMesh } from '@/api/preprocessor';


/**
 * DesignPage - 3D antenna design interface
 * Main workspace for creating and editing antenna geometries
 */
function DesignPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get('readOnly') === 'true' || searchParams.get('readOnly') === '1';
  const readOnlyBackUrl = searchParams.get('back') ?? null;
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
  const viewConfigurations = useAppSelector((state) => state.postprocessing.viewConfigurations);
  const solverState = useAppSelector((state) => state.solver); // Full solver state for persistence
  const docPanelOpen = useAppSelector((state) => state.documentation.panelOpen);
  const variables = useAppSelector(selectVariables);

  // Helper: extract persistable solver state for auto-save
  // fieldData is included — the backend stores it in S3 (not DynamoDB)
  const getPersistableSolverState = () => ({
    results: solverState.results,
    currentDistribution: solverState.currentDistribution,
    radiationPattern: solverState.radiationPattern,
    radiationPatterns: solverState.radiationPatterns,
    multiAntennaResults: solverState.multiAntennaResults,
    frequencySweep: solverState.frequencySweep,
    resultsHistory: solverState.resultsHistory,
    requestedFields: solverState.requestedFields,
    directivityRequested: solverState.directivityRequested,
    directivitySettings: solverState.directivitySettings,
    solverState: solverState.solverState,
    currentFrequency: solverState.currentFrequency,
    fieldResults: solverState.fieldResults,
    fieldData: solverState.fieldData,
    selectedFrequencyHz: solverState.selectedFrequencyHz,
    // Sweep-specific state
    solveMode: solverState.solveMode,
    parameterStudy: solverState.parameterStudy,
    parameterStudyConfig: solverState.parameterStudyConfig,
    selectedSweepPointIndex: solverState.selectedSweepPointIndex,
  });

  // Map solver status to SolverTab-compatible type
  const solvableStatus: 'idle' | 'preparing' | 'running' | 'completed' | 'error' | 'postprocessing-ready' =
    solverStatus === 'failed' ? 'error' : solverStatus === 'cancelled' ? 'idle' : solverStatus;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [dipoleDialogOpen, setDipoleDialogOpen] = useState(false);
  const [loopDialogOpen, setLoopDialogOpen] = useState(false);
  const [rodDialogOpen, setRodDialogOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [editingCustomElement, setEditingCustomElement] = useState<string | null>(null);
  const [lumpedDialogOpen, setLumpedDialogOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [circuitEditorOpen, setCircuitEditorOpen] = useState(false);
  const [frequencySweepDialogOpen, setFrequencySweepDialogOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previousElementCountRef = useRef<number>(0);
  const [triggerSave, setTriggerSave] = useState(0);
  // Track if project is being loaded to skip auto-saves during load
  const projectLoadingRef = useRef<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'designer' | 'solver' | 'postprocessing'>('designer');
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Submission state
  const submitLoading = useAppSelector(selectSubmitLoading);
  const submitError = useAppSelector(selectSubmissionsError);
  const folders = useAppSelector((state) => state.folders.folders);

  const handleTabChange = (_: unknown, newValue: 'designer' | 'solver' | 'postprocessing') => {
    // Block entering Postprocessing tab when solver has no results (idle)
    // or when postprocessing is actively running to avoid confusing state switches.
    if (newValue === 'postprocessing') {
      if (solverWorkflowState === 'idle') return;
      if (solverState.postprocessingStatus === 'running') return;
    }
    setCurrentTab(newValue);
  };

  // Get current project from Redux to detect when it loads
  const currentProject = useAppSelector((state) => state.projects.currentProject);

  // Determine if this project belongs to a course (folder has source_course_id)
  const projectFolder = currentProject?.folder_id
    ? folders.find((f: { id: string; source_course_id?: string }) => f.id === currentProject.folder_id)
    : null;
  const sourceCourseId = (projectFolder as { source_course_id?: string } | null | undefined)?.source_course_id ?? null;

  // Load project on mount if projectId exists
  useEffect(() => {
    if (projectId) {
      dispatch(fetchProject(projectId));
      // Clear documentation state so stale content from a previous project
      // isn't shown while the new project's docs load
      dispatch(clearDocumentation());
    }
    // Load user folders to determine course association
    dispatch(fetchFolders());
  }, [projectId, dispatch]);

  // Parse and restore design elements from project
  useEffect(() => {
    if (!currentProject) return;

    // Load solver state from simulation_results (FIRST — resetSolver clears requestedFields)
    if (currentProject.simulation_results && Object.keys(currentProject.simulation_results).length > 0) {
      console.log('Loading solver state from simulation_results');
      dispatch(loadSolverState(currentProject.simulation_results));
    } else {
      console.log('No simulation results — resetting solver');
      dispatch(resetSolver());
    }

    // Load requested fields from simulation_config (AFTER solver reset so they aren't clobbered)
    const simConfig = currentProject.simulation_config;
    if (simConfig?.requested_fields && Array.isArray(simConfig.requested_fields)) {
      console.log('Loading requested fields from simulation_config:', simConfig.requested_fields);
      dispatch(setFieldDefinitions(simConfig.requested_fields));
    } else {
      dispatch(setFieldDefinitions([]));
    }

    // Load view configurations from ui_state
    const uiState = currentProject.ui_state;
    if (uiState?.view_configurations && Array.isArray(uiState.view_configurations)) {
      console.log('Loading view configurations from ui_state:', uiState.view_configurations);
      dispatch(loadViewConfigurations(uiState.view_configurations));
    } else {
      dispatch(clearViewConfigurations());
    }

    // Restore design elements from design_state
    const designState = currentProject.design_state;
    if (designState?.elements && Array.isArray(designState.elements) && designState.elements.length > 0) {
      console.log('Restored design elements from design_state:', designState.elements);
      dispatch(loadDesign({ elements: designState.elements }));
    } else {
      console.log('Empty project loaded, clearing design state');
      dispatch(loadDesign({ elements: [] }));
    }

    // Restore variables from design_state (v3+), otherwise reset to defaults
    if (designState?.variables && Array.isArray(designState.variables)) {
      console.log('Restored variables from design_state:', designState.variables);
      dispatch(setVariables(designState.variables));
    } else {
      dispatch(resetVariables());
    }

    // Mark design as solved if project has solver results
    // (loadDesign resets isSolved to false, so this must come AFTER)
    if (currentProject.simulation_results && Object.keys(currentProject.simulation_results).length > 0) {
      const solverState = currentProject.simulation_results.solverState;
      if (solverState === 'solved' || solverState === 'postprocessing-ready') {
        dispatch(markAsSolved());
      }
    }

    // Mark project loading complete after state settles (skip auto-saves until then)
    setTimeout(() => {
      projectLoadingRef.current = false;
    }, 500);
  }, [currentProject?.id, dispatch]); // Only re-run when project ID changes

  // Reset loading flag when switching projects
  useEffect(() => {
    projectLoadingRef.current = true;
  }, [projectId]);

  // Auto-save function with retry logic (debounced)
  const saveProjectDebounced = useRef(
    debounce(async (projectElements: typeof elements, fields: any[], views: any[], solverData: any, projectVariables: VariableDefinition[], retryCount = 0) => {
      if (!projectId) {
        return;
      }

      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

      try {
        setSaveStatus('saving');
        setShowSaveIndicator(true);
        setSaveError(null);

        // Save using structured JSON blobs instead of description hack
        await dispatch(updateProject({
          id: projectId,
          data: {
            // Elements snapshot with schema version
            design_state: {
              elements: projectElements,
              variables: projectVariables,
              version: 3,
            },
            // Solver / postprocessor settings
            simulation_config: {
              requested_fields: fields,
            },
            // Solver output
            simulation_results: solverData,
            // Frontend-only view state
            ui_state: {
              view_configurations: views,
            },
          },
        })).unwrap();

        console.log('Auto-saved project with', projectElements.length, 'elements,', fields.length, 'fields,', views.length, 'views, and solver state');

        setSaveStatus('saved');

        // Hide indicator after 2 seconds
        setTimeout(() => {
          setShowSaveIndicator(false);
          setSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error(`Auto-save failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);

        // Check if error is retryable (e.g., 413 Payload Too Large is NOT retryable)
        const parsedError = parseApiError(error);

        if (parsedError.retryable && retryCount < MAX_RETRIES) {
          // Retry after delay
          const delay = RETRY_DELAYS[retryCount];
          setSaveStatus('saving');
          setSaveError(`Retrying in ${delay / 1000}s...`);

          setTimeout(() => {
            saveProjectDebounced(projectElements, fields, views, solverData, projectVariables, retryCount + 1);
          }, delay);
        } else {
          // Non-retryable error or all retries failed
          setSaveStatus('error');
          setSaveError(parsedError.message || 'Failed to save changes. Please check your connection.');

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
    if (projectLoadingRef.current) return; // Skip during project load
    if (triggerSave > 0 && projectId && elements.length > 0) {
      console.log('Triggering auto-save after property change, elements:', elements);
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
    }
  }, [triggerSave, projectId, elements, requestedFields, viewConfigurations, saveProjectDebounced, solverState]);

  // Auto-save on element addition only (not on every property change)
  useEffect(() => {
    if (projectLoadingRef.current) return; // Skip during project load
    // Only save if new elements were added (count increased)
    if (elements && elements.length > previousElementCountRef.current) {
      console.log(`New element(s) added: ${previousElementCountRef.current} -> ${elements.length}, saving...`);
      previousElementCountRef.current = elements.length;
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
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
    if (projectLoadingRef.current) return; // Skip during project load
    if (projectId && (elements.length > 0 || requestedFields.length > 0)) {
      console.log('Requested fields changed, saving...');
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
    }
  }, [requestedFields, projectId, elements, viewConfigurations, saveProjectDebounced, solverState]);

  // Auto-save when view configurations change
  useEffect(() => {
    // Skip auto-save during project load
    if (projectLoadingRef.current) {
      console.log('View configurations changed, skipping save during project load');
      return;
    }
    // Save view configurations even when empty (to persist deletions)
    if (projectId) {
      console.log('View configurations changed, saving...', viewConfigurations.length, 'views');
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
    }
  }, [viewConfigurations, projectId, elements, requestedFields, saveProjectDebounced, solverState]);

  // Auto-save when solver completes (results, radiation pattern, field data, etc.)
  useEffect(() => {
    if (projectLoadingRef.current) return; // Skip during project load
    if (projectId && solverState.results) {
      console.log('Solver results changed, saving...');
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
    }
  }, [solverState.results, solverState.radiationPattern, solverState.multiAntennaResults, solverState.frequencySweep, projectId, elements, requestedFields, viewConfigurations, saveProjectDebounced, solverState]);

  // Auto-save when variables change
  useEffect(() => {
    if (projectLoadingRef.current) return;
    if (projectId && elements.length > 0) {
      console.log('Variables changed, saving...');
      saveProjectDebounced(elements, requestedFields, viewConfigurations, getPersistableSolverState(), variables);
    }
  }, [variables, projectId]);

  // Re-mesh elements whose expressions depend on changed variables
  const prevVariablesRef = useRef<VariableDefinition[]>(variables);
  useEffect(() => {
    if (projectLoadingRef.current) return;
    // Skip initial render and identical references
    if (prevVariablesRef.current === variables) return;
    prevVariablesRef.current = variables;

    // Evaluate full variable context (built-ins + user variables)
    const varCtx = {
      ...BUILTIN_CONSTANTS,
      ...evaluateVariableContextNumeric(variables),
    };

    // Check each element that has stored expressions
    for (const el of elements) {
      if (!el.expressions || Object.keys(el.expressions).length === 0) continue;

      // Re-evaluate each expression and see if the resolved value changed
      const resolved: Record<string, number> = {};
      let changed = false;
      const rawCfg = el.config as Record<string, unknown>;
      const params = (rawCfg.parameters || rawCfg) as Record<string, number>;

      // Map from expression keys to config keys per type
      const EXPR_MAP: Record<string, Record<string, string>> = {
        dipole: {
          length: 'length', radius: 'wire_radius', gap: 'gap', segments: 'segments',
          positionX: 'positionX', positionY: 'positionY', positionZ: 'positionZ',
          orientationX: 'orientationX', orientationY: 'orientationY', orientationZ: 'orientationZ',
        },
        loop: {
          radius: 'radius', wireRadius: 'wire_radius', feedGap: 'gap', segments: 'segments',
          positionX: 'positionX', positionY: 'positionY', positionZ: 'positionZ',
          normalX: 'normalX', normalY: 'normalY', normalZ: 'normalZ',
        },
        rod: {
          radius: 'wire_radius', segments: 'segments',
          start_x: 'start_x', start_y: 'start_y', start_z: 'start_z',
          end_x: 'end_x', end_y: 'end_y', end_z: 'end_z',
        },
      };
      const mapping = EXPR_MAP[el.type] || {};

      // Extract individual position/orientation/normal values from config arrays
      // so the comparison works for these decomposed expression keys too.
      const pos = (params as any).center_position || el.position || [0, 0, 0];
      const ori = (params as any).orientation || (params as any).normal_vector || [0, 0, 1];
      const extendedParams: Record<string, number> = {
        ...params,
        positionX: pos[0], positionY: pos[1], positionZ: pos[2],
        orientationX: ori[0], orientationY: ori[1], orientationZ: ori[2],
        normalX: ori[0], normalY: ori[1], normalZ: ori[2],
      };

      for (const [key, expr] of Object.entries(el.expressions)) {
        try {
          const newVal = parseNumericOrExpression(expr, varCtx);
          resolved[key] = newVal;

          // Compare with current config value
          const configKey = mapping[key];
          if (configKey) {
            const currentVal: number = extendedParams[configKey];
            if (currentVal === undefined || Math.abs(newVal - currentVal) > 1e-15) {
              changed = true;
            }
          }
        } catch {
          // Expression evaluation failed (e.g., undefined variable) — skip
        }
      }

      if (changed) {
        console.log(`Variable change triggers remesh of ${el.name} (${el.id})`);
        dispatch(remeshElementExpressions({ elementId: el.id, resolvedValues: resolved }));
      }
    }
  }, [variables, elements, dispatch]);

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
      case 'rod':
        setRodDialogOpen(true);
        break;
      case 'custom':
        setCustomDialogOpen(true);
        break;
      case 'lumped-element':
        setLumpedDialogOpen(true);
        break;
      case 'voltage-source':
        setSourceDialogOpen(true);
        break;
      case 'circuit-editor':
        setCircuitEditorOpen(true);
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

  const handleCustomGenerate = async (data: any) => {
    try {
      // If editing, remove the old element first
      if (editingCustomElement) {
        dispatch(removeElement(editingCustomElement));
        setEditingCustomElement(null);
      }
      await dispatch(generateCustom(data)).unwrap();
      dispatch(addNotification({
        id: Date.now(),
        message: `Custom antenna "${data.name}" ${editingCustomElement ? 'updated' : 'generated'} successfully!`,
        severity: 'success',
        duration: 5000,
      }));
    } catch (error: any) {
      dispatch(addNotification({
        id: Date.now(),
        message: error || 'Failed to generate custom antenna',
        severity: 'error',
        duration: 5000,
      }));
      throw error;
    }
  };

  const handleEditElement = (elementId: string) => {
    const element = elements.find((el) => el.id === elementId);
    if (!element || element.type !== 'custom') return;
    setEditingCustomElement(elementId);
    setCustomDialogOpen(true);
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

  // Circuit editor handler — batch-replace sources + lumped elements + ports + appended nodes
  const handleCircuitApply = (data: {
    sources: any[];
    lumped_elements: any[];
    ports: any[];
    appended_nodes: Array<{ index: number; label: string }>;
  }) => {
    const elementId = selectedElementId;
    if (!elementId) return;
    dispatch(setElementCircuit({
      elementId,
      sources: data.sources,
      lumped_elements: data.lumped_elements,
      ports: data.ports,
      appended_nodes: data.appended_nodes,
    }));
    dispatch(addNotification({
      id: Date.now(),
      message: 'Circuit updated',
      severity: 'success',
      duration: 3000,
    }));
    // Trigger auto-save
    setTriggerSave(prev => prev + 1);
  };

  // Get terminal node indices for the selected element
  const getTerminalNodeIndices = (element: typeof elements[number]): number[] => {
    if (element.type === 'custom') {
      const cfg = element.config as any;
      if (cfg?.nodes) {
        return cfg.nodes
          .filter((n: any) => n.nodeType === 'terminal' || n.type === 'terminal')
          .map((n: any) => n.id);
      }
    }
    // For built-in types: use source nodes as terminals (the feed gap nodes)
    const indices = new Set<number>();
    for (const src of element.sources || []) {
      if (src.node_start != null && src.node_start > 0) indices.add(src.node_start);
      if (src.node_end != null && src.node_end > 0) indices.add(src.node_end);
    }
    return Array.from(indices);
  };

  // Element selection handler
  const handleElementSelect = (elementId: string) => {
    dispatch(setSelectedElement(elementId));
    // Close doc panel so properties panel can show on the Designer tab
    if (docPanelOpen && currentTab === 'designer') {
      dispatch(closeDocPanel());
    }
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

  // Orientation change handler — re-meshes element via preprocessor
  const orientationChangeRef = useRef(
    debounce(async (elementId: string, orientation: [number, number, number]) => {
      // Validate that the orientation vector is not zero
      if (orientation[0] === 0 && orientation[1] === 0 && orientation[2] === 0) {
        return;
      }
      console.log('Orientation changed, re-meshing:', elementId, orientation);
      try {
        await dispatch(remeshElementOrientation({ elementId, orientation })).unwrap();
        dispatch(addNotification({
          id: Date.now(),
          message: 'Mesh updated with new orientation',
          severity: 'success',
          duration: 2000,
        }));
        // Trigger auto-save after re-mesh
        setTriggerSave(prev => prev + 1);
      } catch (error: any) {
        console.error('Re-mesh failed:', error);
        dispatch(addNotification({
          id: Date.now(),
          message: `Failed to update orientation: ${error}`,
          severity: 'error',
          duration: 5000,
        }));
      }
    }, 500)
  );

  const handleOrientationChange = (elementId: string, orientation: [number, number, number]) => {
    orientationChangeRef.current(elementId, orientation);
  };

  const handleSourceChange = (elementId: string, source: Source) => {
    dispatch(updateElementSource({ elementId, source }));
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

    if (action === 'validate-geometry') {
      const issues = validateGeometry(elements || [], currentFrequency ? currentFrequency * 1e6 : undefined);
      if (issues.length === 0) {
        dispatch(addNotification({
          id: Date.now(),
          message: 'Geometry validation passed — no issues found.',
          severity: 'success',
          duration: 4000,
        }));
      } else {
        const errors = issues.filter((i) => i.severity === 'error');
        const warnings = issues.filter((i) => i.severity === 'warning');
        const summary = [
          errors.length > 0 ? `${errors.length} error(s)` : '',
          warnings.length > 0 ? `${warnings.length} warning(s)` : '',
        ].filter(Boolean).join(', ');
        const details = issues
          .map((i) => `[${i.element}] ${i.message}`)
          .join('\n');
        dispatch(addNotification({
          id: Date.now(),
          message: `Geometry validation: ${summary}.\n${details}`,
          severity: errors.length > 0 ? 'error' : 'warning',
          duration: 8000,
        }));
      }
      return;
    }

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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const scene3DRef = useRef<Scene3DHandle>(null);

  const handleZoomIn = () => {
    console.log('[DesignPage] Zoom in triggered');
    scene3DRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    console.log('[DesignPage] Zoom out triggered');
    scene3DRef.current?.zoomOut();
  };

  const handleResetView = () => {
    console.log('[DesignPage] Reset view triggered');
    scene3DRef.current?.resetView();
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // ── Submission handlers ──────────────────────────────────────────────────
  const handleSubmitClick = () => {
    setSubmitDialogOpen(true);
  };

  const handleSubmitConfirm = async () => {
    if (!sourceCourseId || !currentProject?.id) return;
    const result = await dispatch(
      submitProjectThunk({
        courseId: sourceCourseId,
        projectId: String(currentProject.id),
      }),
    );
    if (submitProjectThunk.fulfilled.match(result)) {
      setSubmitDialogOpen(false);
      dispatch(showSuccess('Project submitted successfully!'));
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Read-only submission preview banner */}
      {isReadOnly && (
        <Alert
          severity="warning"
          icon={<LockIcon fontSize="small" />}
          sx={{ borderRadius: 0, py: 0.5, flexShrink: 0 }}
          action={
            readOnlyBackUrl ? (
              <Button
                size="small"
                color="inherit"
                startIcon={<BackIcon />}
                onClick={() => navigate(readOnlyBackUrl)}
              >
                Back to Submissions
              </Button>
            ) : undefined
          }
        >
          <strong>Read-Only Submission Preview</strong> — No changes will be saved.
        </Alert>
      )}
      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="design workspace tabs"
          sx={{ flex: 1 }}
        >
          <Tab label="Designer" value="designer" />
          <Tab label="Solver" value="solver" />
          <Tab label="Postprocessing" value="postprocessing" disabled={solverWorkflowState === 'idle'} />
        </Tabs>
        <Tooltip title={docPanelOpen ? 'Hide Documentation' : 'Show Documentation'}>
          <IconButton
            size="small"
            onClick={() => dispatch(toggleDocPanel())}
            color={docPanelOpen ? 'primary' : 'default'}
            sx={{ mr: 1 }}
          >
            <DescriptionIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tab Content + Documentation Panel */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {currentTab === 'designer' && (
      <DesignCanvas
        elements={elements}
        selectedElementId={selectedElementId}
        onElementSelect={handleElementSelect}
        mesh={mesh || undefined} // Keep for backward compatibility
        currentDistribution={currentDistribution || undefined} // Pass solver results
        hideRightPanel={docPanelOpen}
        gridVisible={gridVisible}
        cameraMode={cameraMode}
        scene3DRef={scene3DRef}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onToggleGrid={() => handleViewOption('toggle-grid')}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        leftPanel={
          <TreeViewPanel
            elements={elements}
            selectedElementId={selectedElementId}
            onElementSelect={handleElementSelect}
            onElementDelete={handleElementDelete}
            onElementDuplicate={handleElementDuplicate}
            onElementRename={handleElementRename}
            onElementEdit={handleEditElement}
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
            onOrientationChange={handleOrientationChange}
            onSourceChange={handleSourceChange}
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
            currentTab={currentTab}
            onAntennaTypeSelect={handleAntennaTypeSelect}
            onAnalysisAction={handleAnalysisAction}
            onViewOption={handleViewOption}
            solverStatus={solverStatus}
            solverProgress={solverProgress}
            showSubmit={!!sourceCourseId && !isReadOnly}
            onSubmit={handleSubmitClick}
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
          solverStatus={solvableStatus}
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
          projectName={currentProject?.name}
        />
      )}
        </Box>

        {/* Documentation Panel (right-side, all tabs) */}
        {docPanelOpen && projectId && (
          <DocumentationPanel projectId={projectId} />
        )}
      </Box>

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
      <RodDialog
        open={rodDialogOpen}
        onClose={() => setRodDialogOpen(false)}
        onGenerate={handleRodGenerate}
        loading={meshGenerating}
      />
      <CustomAntennaDialog
        open={customDialogOpen}
        onClose={() => { setCustomDialogOpen(false); setEditingCustomElement(null); }}
        onGenerate={handleCustomGenerate}
        initialData={(() => {
          if (!editingCustomElement) return undefined;
          const el = elements.find((e) => e.id === editingCustomElement);
          if (!el || el.type !== 'custom') return undefined;
          const cfg = (el.config as any)?.parameters || el.config as any;
          const meshNodes = el.mesh?.nodes ?? [];
          const meshEdges = el.mesh?.edges ?? [];
          const sourceIds = (el.sources ?? []).flatMap((s: any) =>
            [s.node_start, s.node_end].filter((id: number) => id != null && id > 0)
          );
          return {
            elementId: el.id,
            name: el.name,
            nodes: (cfg.nodes ?? meshNodes).map((n: any) => ({
              id: n.id ?? n.index,
              x: n.x ?? n.position?.[0] ?? 0,
              y: n.y ?? n.position?.[1] ?? 0,
              z: n.z ?? n.position?.[2] ?? 0,
            })),
            edges: (cfg.edges ?? meshEdges).map((e: any) => ({
              node_start: e.node_start ?? e.start,
              node_end: e.node_end ?? e.end,
              radius: e.radius,
            })),
            sourceNodeIds: sourceIds,
          };
        })()}
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
      <CircuitEditor
        open={circuitEditorOpen}
        onClose={() => setCircuitEditorOpen(false)}
        onApply={handleCircuitApply}
        element={elements.find(el => el.id === selectedElementId) ?? null}
        terminalNodeIndices={
          selectedElementId
            ? getTerminalNodeIndices(elements.find(el => el.id === selectedElementId)!)
            : []
        }
      />
      <FrequencySweepDialog
        open={frequencySweepDialogOpen}
        onClose={() => setFrequencySweepDialogOpen(false)}
        onSubmit={handleFrequencySweep}
        isLoading={solverStatus === 'running' || solverStatus === 'preparing'}
      />

      {/* Postprocessing Dialogs */}
      <AddViewDialog />
      <AddAntennaElementDialog />
      <AddFieldVisualizationDialog />
      <AddScalarPlotDialog />

      {/* Submit to Course Dialog */}
      <SubmitDialog
        open={submitDialogOpen}
        onClose={() => setSubmitDialogOpen(false)}
        onConfirm={handleSubmitConfirm}
        projectName={currentProject?.name ?? 'Untitled'}
        courseName={projectFolder?.name}
        examinerName={(projectFolder as { examiner_name?: string } | null | undefined)?.examiner_name}
        loading={submitLoading}
        error={submitError}
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
