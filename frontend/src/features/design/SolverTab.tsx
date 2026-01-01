import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Paper, Button, ButtonGroup, Typography, Divider, Chip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import GridOnIcon from '@mui/icons-material/GridOn';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TreeViewPanel from './TreeViewPanel';
import Scene3D from './Scene3D';
import WireGeometry from './WireGeometry';
import { FieldRegionVisualization } from './FieldRegionVisualization';
import { SolverPropertiesPanel } from './SolverPropertiesPanel';
import { FrequencyInputDialog } from './FrequencyInputDialog';
import { AddFieldDialog } from './AddFieldDialog';
import type { AntennaElement } from '@/types/models';
import type { AppDispatch, RootState } from '@/store/store';
import { addFieldRegion, deleteFieldRegion, updateFieldRegion } from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';

/**
 * SolverTab - New 3-panel layout for solver workflow
 * Top: Ribbon Menu with Solve actions
 * Left: Tree View (280px) - Structure + Requested Quantities
 * Middle: 3D Visualization (flex) - Geometry + Field Regions
 * Right: Properties Panel (300px) - Field region editor
 */

interface SolverTabProps {
  elements: AntennaElement[];
  selectedElementId: string | null;
  onElementSelect: (id: string) => void;
  onElementVisibilityToggle: (elementId: string, visible: boolean) => void;
  solverStatus?: 'idle' | 'preparing' | 'running' | 'completed' | 'error' | 'postprocessing-ready';
}

export function SolverTab({ elements, selectedElementId, onElementSelect, onElementVisibilityToggle, solverStatus = 'idle' }: SolverTabProps) {
  const dispatch = useDispatch<AppDispatch>();
  
  // Redux state
  const requestedFields = useSelector((state: RootState) => state.solver.requestedFields);
  
  // Local state
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  
  // Field region visualization state
  const [fieldRegionsVisible, setFieldRegionsVisible] = useState(true);

  // Wrapped handlers with logging
  const handleFieldRegionsVisibleChange = (visible: boolean) => {
    console.log('[SolverTab] Field regions visible changed:', visible);
    setFieldRegionsVisible(visible);
  };

  // Debug: Log state
  console.log('[SolverTab] State:', {
    elementsCount: elements.length,
    fieldsCount: requestedFields.length,
    fieldsVisible: fieldRegionsVisible,
    selectedFieldId
  });
  console.log('[SolverTab] Requested fields:', requestedFields);

  const handleSolveSingle = () => {
    setFrequencyDialogOpen(true);
  };

  const handleSweep = () => {
    // TODO: Open FrequencySweepDialog (T4.B3)
    console.log('Sweep clicked');
  };

  const handleAddDirectivity = () => {
    // TODO: Add directivity to requested quantities (T4.B3)
    console.log('Add Directivity clicked');
  };

  const handleAddField = () => {
    setAddFieldDialogOpen(true);
  };

  const handleComputePostprocessing = () => {
    // TODO: Run postprocessor (T4.B3)
    console.log('Compute Postprocessing clicked');
  };

  const handleFrequencySolve = (frequency: number, unit: 'MHz' | 'GHz') => {
    // TODO: Dispatch solver action (T4.B3)
    console.log('Solve at frequency:', frequency, unit);
    setFrequencyDialogOpen(false);
  };

  const handleFieldAdd = (fieldDefinition: FieldDefinition) => {
    // Add field to Redux store
    dispatch(addFieldRegion(fieldDefinition));
    setAddFieldDialogOpen(false);
  };

  const handleFieldVisibilityToggle = (fieldId: string, visible: boolean) => {
    dispatch(updateFieldRegion({ id: fieldId, updates: { visible } }));
  };

  const handleFieldDelete = (fieldId: string) => {
    dispatch(deleteFieldRegion(fieldId));
  };

  const handleFieldRename = (fieldId: string, newName: string) => {
    dispatch(updateFieldRegion({ id: fieldId, updates: { name: newName } }));
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* SOLVER RIBBON MENU */}
      <Paper
        elevation={1}
        sx={{
          p: 1.5,
          borderRadius: 0,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        {/* Group 1: Solve Control */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Solve Control
            </Typography>
            {solverStatus === 'completed' && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Solved"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'grey.400', bgcolor: 'grey.800' }}
              />
            )}
            {solverStatus === 'postprocessing-ready' && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Ready"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', color: 'warning.main', bgcolor: 'warning.dark' }}
              />
            )}
          </Box>
          <ButtonGroup size="small" variant="outlined">
            <Button
              startIcon={<PlayArrowIcon />}
              onClick={handleSolveSingle}
            >
              Solve Single
            </Button>
            <Button
              startIcon={<ShowChartIcon />}
              onClick={handleSweep}
            >
              Sweep
            </Button>
          </ButtonGroup>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Group 2: Field Definition */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
            Field Definition
          </Typography>
          <ButtonGroup size="small" variant="outlined">
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleAddDirectivity}
            >
              Add Directivity
            </Button>
            <Button
              startIcon={<GridOnIcon />}
              onClick={handleAddField}
            >
              Add Field
            </Button>
          </ButtonGroup>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Group 3: Postprocessing */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
            Postprocessing
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CalculateIcon />}
            onClick={handleComputePostprocessing}
          >
            Compute Postprocessing
          </Button>
        </Box>
      </Paper>

      {/* 3-PANEL LAYOUT */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
      {/* LEFT PANEL - Tree View (280px fixed) */}
      <Box
        sx={{
          width: 280,
          height: '100%',
          borderRight: 1,
          borderColor: 'divider',
          overflow: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        <TreeViewPanel
          elements={elements}
          selectedElementId={selectedElementId}
          onElementSelect={onElementSelect}
          onElementDelete={() => {}}
          onElementDuplicate={() => {}}
          onElementRename={() => {}}
          onElementLock={() => {}}
          onElementVisibilityToggle={onElementVisibilityToggle}
          mode="solver"
          fieldRegions={requestedFields}
          onFieldSelect={setSelectedFieldId}
          selectedFieldId={selectedFieldId}
          onFieldVisibilityToggle={handleFieldVisibilityToggle}
          onFieldDelete={handleFieldDelete}
          onFieldRename={handleFieldRename}
        />
      </Box>

      {/* MIDDLE PANEL - 3D Visualization (flex, remaining space) */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
        }}
      >
        <Scene3D elements={elements}>
          {/* Render antenna elements */}
          <WireGeometry
            elements={elements}
            selectedElementId={selectedElementId}
            onElementSelect={onElementSelect}
            showNodes={false}
          />
          
          {/* Render field regions */}
          <FieldRegionVisualization
            fieldDefinitions={requestedFields}
            selectedFieldId={selectedFieldId}
            visible={fieldRegionsVisible}
          />
        </Scene3D>
      </Box>

      {/* RIGHT PANEL - Properties Panel (300px fixed) */}
      <Box
        sx={{
          width: 300,
          height: '100%',
          borderLeft: 1,
          borderColor: 'divider',
          overflow: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        <SolverPropertiesPanel
          selectedFieldId={selectedFieldId}
          fieldRegionsVisible={fieldRegionsVisible}
          onFieldRegionsVisibleChange={handleFieldRegionsVisibleChange}
        />
      </Box>
      </Box>

      {/* DIALOGS */}
      <FrequencyInputDialog
        open={frequencyDialogOpen}
        onClose={() => setFrequencyDialogOpen(false)}
        onSolve={handleFrequencySolve}
      />
      
      <AddFieldDialog
        open={addFieldDialogOpen}
        onClose={() => setAddFieldDialogOpen(false)}
        onCreate={handleFieldAdd}
      />
    </Box>
  );
}
