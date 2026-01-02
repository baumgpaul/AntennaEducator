import { useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import type { SolverWorkflowState } from '@/store/solverSlice';
import { selectResultsStale } from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { AntennaElement } from '@/types/models';
import type { FrequencySweepResult } from '@/types/api';
import Scene3D from './Scene3D';
import FieldVisualization from './FieldVisualization';
import RibbonMenu from './RibbonMenu';
import TreeViewPanel from './TreeViewPanel';
import PostprocessingPropertiesPanel from '../postprocessing/PostprocessingPropertiesPanel';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectViewConfigurations,
  selectSelectedViewId,
  selectSelectedItemId,
  selectView,
  deleteViewConfiguration,
  renameViewConfiguration,
  selectItem,
  removeItemFromView,
  toggleItemVisibility,
} from '@/store/postprocessingSlice';

interface PostprocessingTabProps {
  solverState: SolverWorkflowState;
  elements: AntennaElement[];
  requestedFields: FieldDefinition[];
  directivityRequested: boolean;
  fieldResults: Record<string, { computed: boolean; num_points: number }> | null;
  currentFrequency: number | null; // MHz - current single frequency
  frequencySweep: FrequencySweepResult | null; // Sweep data if available
  fieldData: Record<string, Record<number, {
    points: Array<[number, number, number]>;
    E_mag?: number[];
    H_mag?: number[];
    E_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
    H_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
  }>> | null;
}

function PostprocessingTab({
  solverState,
  elements,
  requestedFields,
  fieldResults,
  currentFrequency,
  frequencySweep,
  fieldData,
}: PostprocessingTabProps) {
  const dispatch = useAppDispatch();
  
  // Redux state for view configurations
  const viewConfigurations = useAppSelector(selectViewConfigurations);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const resultsStale = useAppSelector(selectResultsStale);
  
  // Backwards compatibility: map selectedItemId to selectedItem for existing code
  const selectedItem = selectedItemId;
  
  const [selectedFrequencyIndex] = useState<number>(0);

  // Debug logging
  console.log('[PostprocessingTab] Props:', { 
    currentFrequency, 
    frequencySweep: frequencySweep ? {
      numFrequencies: frequencySweep.frequencies?.length,
      frequencies: frequencySweep.frequencies
    } : null 
  });

  // Determine if we're in sweep mode
  const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
  const availableFrequencies = isSweepMode ? frequencySweep!.frequencies : (currentFrequency ? [currentFrequency * 1e6] : []); // MHz to Hz
  
  console.log('[PostprocessingTab] Frequency state:', { 
    isSweepMode, 
    availableFrequenciesCount: availableFrequencies.length,
    selectedFrequencyIndex 
  });
  
  // Get current frequency in Hz for field data lookup
  const displayFrequencyHz = availableFrequencies[selectedFrequencyIndex] || (currentFrequency ? currentFrequency * 1e6 : null);

  const statusMessage =
    solverState === 'postprocessing-ready'
      ? 'Postprocessing results ready. Select a field to visualize.'
      : 'Solver results available (voltages/currents). Select a field to visualize.';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RIBBON MENU */}
      <RibbonMenu currentTab="postprocessing" />
      
      {/* WARNING BANNER - Show when no results or results are stale */}
      {(!frequencySweep && !currentFrequency) || resultsStale ? (
        <Alert 
          severity={resultsStale ? "warning" : "info"} 
          sx={{ m: 2, mb: 0 }}
        >
          <AlertTitle>{resultsStale ? "Results Outdated" : "No Results Available"}</AlertTitle>
          {resultsStale 
            ? "The antenna structure or solver settings have changed. Run the solver again to update results."
            : "No solver results found. Please run the solver first."}
        </Alert>
      ) : null}
      
      {/* MAIN CONTENT - 3 PANELS */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT PANEL - TreeView with View Configurations */}
        <TreeViewPanel
          mode="postprocessing"
          viewConfigurations={viewConfigurations}
          selectedViewId={selectedViewId}
          selectedItemId={selectedItemId}
          onViewSelect={(viewId) => dispatch(selectView(viewId))}
          onViewDelete={(viewId) => dispatch(deleteViewConfiguration(viewId))}
          onViewRename={(viewId, newName) => dispatch(renameViewConfiguration({ viewId, name: newName }))}
          onItemSelect={(viewId, itemId) => {
            dispatch(selectView(viewId));
            dispatch(selectItem(itemId));
          }}
          onItemDelete={(viewId, itemId) => dispatch(removeItemFromView({ viewId, itemId }))}
          onItemVisibilityToggle={(viewId, itemId) => dispatch(toggleItemVisibility({ viewId, itemId }))}
        />

      {/* MIDDLE PANEL - 3D Visualization */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          position: 'relative',
        }}
      >
        {!selectedItem || selectedItem === 'currents' || selectedItem === 'voltages' || selectedItem === 'directivity' ? (
          <Typography variant="h6" color="text.secondary" textAlign="center">
            {statusMessage}
          </Typography>
        ) : (
          <Scene3D elements={elements} showScale showAxisLabels>
            {/* Render selected field */}
            {requestedFields
              .filter(f => f.id === selectedItem && (fieldResults?.[f.id]?.computed ?? false))
              .map(field => {
                // Get field data for current frequency
                const currentFieldData = fieldData && displayFrequencyHz
                  ? fieldData[field.id]?.[displayFrequencyHz]
                  : undefined;
                
                return (
                  <FieldVisualization
                    key={field.id}
                    field={field}
                    visualizationMode="magnitude"
                    colorMap="jet"
                    opacity={0.8}
                    selectedComponent="x"
                    complexPart="magnitude"
                    fieldData={currentFieldData}
                  />
                );
              })}
          </Scene3D>
        )}
      </Box>

      {/* RIGHT PANEL - Properties Panel */}
      <PostprocessingPropertiesPanel />
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
