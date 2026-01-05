import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Alert,
  AlertTitle,
  Snackbar,
} from '@mui/material';
import type { SolverWorkflowState } from '@/store/solverSlice';
import { selectResultsStale } from '@/store/solverSlice';
import { selectIsSolved } from '@/store/designSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { AntennaElement } from '@/types/models';
import type { FrequencySweepResult } from '@/types/api';
import Scene3D from './Scene3D';
import RibbonMenu from './RibbonMenu';
import TreeViewPanel from './TreeViewPanel';
import PostprocessingPropertiesPanel from '../postprocessing/PostprocessingPropertiesPanel';
import LineViewPanel from '../postprocessing/LineViewPanel';
import { ViewItemRenderer } from '../postprocessing/ViewItemRenderer';
import { Colorbar } from '../postprocessing/Colorbar';
import ExportPDFDialog from './dialogs/ExportPDFDialog';
import { exportToPDF } from '@/utils/exportToPDF';
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
  projectName?: string;
}

function PostprocessingTab({
  elements,
  currentFrequency,
  frequencySweep,
  projectName,
}: PostprocessingTabProps) {
  const dispatch = useAppDispatch();
  
  // Redux state for view configurations
  const viewConfigurations = useAppSelector(selectViewConfigurations);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const resultsStale = useAppSelector(selectResultsStale);
  const isSolved = useAppSelector(selectIsSolved);
  
  const [selectedFrequencyIndex] = useState<number>(0);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  
  // Ref for the middle panel to capture for PDF export
  const middlePanelRef = useRef<HTMLDivElement>(null);

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

  // Handle PDF export
  const handlePDFExport = async (options: {
    includeMetadata: boolean;
    resolution: '1080p' | '1440p' | '4K';
    filename: string;
  }) => {
    if (!middlePanelRef.current || !selectedViewId) {
      setSnackbarMessage('Error: Cannot export - no view selected');
      setShowSnackbar(true);
      return;
    }

    const selectedView = viewConfigurations.find((v) => v.id === selectedViewId);
    if (!selectedView) {
      setSnackbarMessage('Error: Selected view not found');
      setShowSnackbar(true);
      return;
    }

    try {
      await exportToPDF({
        targetElement: middlePanelRef.current,
        view: selectedView,
        metadata: {
          include: options.includeMetadata,
          projectName,
          frequency: displayFrequencyHz || undefined,
        },
        resolution: options.resolution,
        filename: options.filename,
      });
      
      setSnackbarMessage(`PDF exported successfully: ${options.filename}.pdf`);
      setShowSnackbar(true);
    } catch (error) {
      console.error('PDF export failed:', error);
      setSnackbarMessage(`Error: ${error instanceof Error ? error.message : 'PDF export failed'}`);
      setShowSnackbar(true);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RIBBON MENU */}
      <RibbonMenu currentTab="postprocessing" />
      
      {/* EXPORT PDF DIALOG */}
      <ExportPDFDialog projectName={projectName} onExport={handlePDFExport} />
      
      {/* SNACKBAR FOR NOTIFICATIONS */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={4000}
        onClose={() => setShowSnackbar(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      
      {/* WARNING BANNER - Show when no results or results are stale or unsolved */}
      {(!frequencySweep && !currentFrequency) || resultsStale || !isSolved ? (
        <Alert 
          severity={resultsStale ? "warning" : !isSolved && (!currentFrequency && !frequencySweep) ? "info" : "info"} 
          sx={{ m: 2, mb: 0 }}
        >
          <AlertTitle>
            {resultsStale ? "Results Outdated" : 
             !isSolved && (!currentFrequency && !frequencySweep) ? "No Results Available" :
             !isSolved ? "Design Modified" :
             "No Results Available"}
          </AlertTitle>
          {resultsStale 
            ? "The antenna structure or solver settings have changed. Run the solver again to update results."
            : !isSolved && (!currentFrequency && !frequencySweep)
            ? "No solver results found. Please run the solver first."
            : !isSolved
            ? "The antenna structure has been modified. Results shown may be outdated. Run the solver and postprocessor again to update."
            : "No solver results found. Please run the solver first."}
        </Alert>
      ) : null}
      
      {/* MAIN CONTENT - 3 PANELS */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT PANEL - TreeView with View Configurations (280px fixed) */}
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
        </Box>

      {/* MIDDLE PANEL - 3D Visualization OR Line View (flex, remaining space) */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: selectedViewId && viewConfigurations.find(v => v.id === selectedViewId)?.viewType === 'Line' 
            ? 'background.default' 
            : '#1a1a1a',
        }}
      >
        {!selectedViewId ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="h6" color="text.secondary">
              No view selected. Create a view to get started.
            </Typography>
          </Box>
        ) : (() => {
          const selectedView = viewConfigurations.find((view) => view.id === selectedViewId);
          
          // Render Line View Panel for Line views
          if (selectedView?.viewType === 'Line') {
            return <LineViewPanel view={selectedView} />;
          }
          
          // Render 3D Scene for 3D views
          return (
            <Scene3D elements={elements} showScale showAxisLabels>
              {/* Render all visible items in the selected view */}
              {selectedView?.items
                .filter((item) => item.visible)
                .map((item) => (
                  <ViewItemRenderer
                    key={item.id}
                    item={item}
                    frequencyHz={displayFrequencyHz || undefined}
                  />
                ))}
            </Scene3D>
          );
        })()}
        
        {/* Colorbar - shown when any color-mapped items are visible in 3D views */}
        {selectedViewId && (() => {
          const selectedView = viewConfigurations.find((view) => view.id === selectedViewId);
          
          // Only show colorbar for 3D views
          if (selectedView?.viewType !== '3D') return null;
          
          const visibleColorMappedItems = selectedView?.items.filter(
            (item) => 
              item.visible && 
              ['current', 'voltage', 'field-magnitude', 'directivity', 'field-vector'].includes(item.type)
          ) || [];
          
          // Show colorbar for the first visible color-mapped item
          const firstColorItem = visibleColorMappedItems[0];
          if (!firstColorItem) return null;
          
          // Determine min/max and label based on item type
          let min = 0, max = 1, label = 'Value', unit = '';
          
          if (firstColorItem.valueRangeMode === 'manual') {
            min = firstColorItem.valueRangeMin || 0;
            max = firstColorItem.valueRangeMax || 1;
          } else {
            // Auto range - will be computed by renderer, use placeholder
            min = 0;
            max = 1;
          }
          
          // Set label and unit based on item type
          switch (firstColorItem.type) {
            case 'current':
              label = 'Current';
              unit = 'A';
              break;
            case 'voltage':
              label = 'Voltage';
              unit = 'V';
              break;
            case 'field-magnitude':
              label = 'Field';
              unit = 'V/m';
              break;
            case 'directivity':
              label = 'Directivity';
              unit = firstColorItem.scale === 'logarithmic' ? 'dBi' : 'linear';
              break;
            case 'field-vector':
              label = 'Field Magnitude';
              unit = 'V/m';
              break;
          }
          
          return (
            <Colorbar
              min={min}
              max={max}
              colorMap={(firstColorItem.colorMap || 'jet') as 'jet' | 'turbo' | 'viridis' | 'plasma' | 'twilight'}
              label={label}
              unit={unit}
              position="right"
            />
          );
        })()}
      </Box>

      {/* RIGHT PANEL - Properties Panel (320px fixed) */}
      <Box
        sx={{
          width: 320,
          height: '100%',
          borderLeft: 1,
          borderColor: 'divider',
          overflow: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        <PostprocessingPropertiesPanel />
      </Box>
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
