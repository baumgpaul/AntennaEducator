import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  SelectChangeEvent,
  IconButton,
  Chip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { SolverWorkflowState } from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { AntennaElement } from '@/types/models';
import type { FrequencySweepResult } from '@/types/api';
import Scene3D from './Scene3D';
import FieldVisualization from './FieldVisualization';
import RibbonMenu from './RibbonMenu';
import TreeViewPanel from './TreeViewPanel';
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
import type { ColorMapType } from '@/utils/colorMaps';

type VisualizationMode = 'magnitude' | 'vectorial' | 'component' | 'phase';
type Component = 'x' | 'y' | 'z';
type ComplexPart = 'magnitude' | 'real' | 'imaginary';

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
  
  // Backwards compatibility: map selectedItemId to selectedItem for existing code
  const selectedItem = selectedItemId;
  
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('magnitude');
  const [colorMap, setColorMap] = useState<ColorMapType>('jet');
  const [opacity, setOpacity] = useState<number>(80);
  const [selectedComponent, setSelectedComponent] = useState<Component>('x');
  const [complexPart, setComplexPart] = useState<ComplexPart>('magnitude');
  const [selectedFrequencyIndex, setSelectedFrequencyIndex] = useState<number>(0);

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

  const handlePreviousFrequency = () => {
    if (selectedFrequencyIndex > 0) {
      setSelectedFrequencyIndex(selectedFrequencyIndex - 1);
    }
  };

  const handleNextFrequency = () => {
    if (selectedFrequencyIndex < availableFrequencies.length - 1) {
      setSelectedFrequencyIndex(selectedFrequencyIndex + 1);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RIBBON MENU */}
      <RibbonMenu currentTab="postprocessing" />
      
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
                    visualizationMode={visualizationMode}
                    colorMap={colorMap}
                    opacity={opacity}
                    selectedComponent={selectedComponent}
                    complexPart={complexPart}
                    fieldData={currentFieldData}
                  />
                );
              })}
          </Scene3D>
        )}
      </Box>

      {/* RIGHT PANEL - Properties Panel */}
      <Box
        sx={{
          width: 300,
          borderLeft: 1,
          borderColor: 'divider',
          overflowY: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        {!selectedItem ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              Select an output to view details
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {/* Frequency Selector - shown at top for all items */}
            {isSweepMode && availableFrequencies.length > 1 && (
              <Box sx={{ mb: 3, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Frequency
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton 
                    size="small" 
                    onClick={handlePreviousFrequency}
                    disabled={selectedFrequencyIndex === 0}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <Chip 
                    label={`${(availableFrequencies[selectedFrequencyIndex] / 1e6).toFixed(1)} MHz`}
                    color="primary"
                    variant="outlined"
                    sx={{ flex: 1, fontWeight: 600 }}
                  />
                  <IconButton 
                    size="small" 
                    onClick={handleNextFrequency}
                    disabled={selectedFrequencyIndex === availableFrequencies.length - 1}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, textAlign: 'center' }}>
                  {selectedFrequencyIndex + 1} of {availableFrequencies.length}
                </Typography>
              </Box>
            )}

            {/* Single Frequency Display - shown at top for all items */}
            {!isSweepMode && currentFrequency && (
              <Box sx={{ mb: 3, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Frequency
                </Typography>
                <Chip 
                  label={`${currentFrequency.toFixed(1)} MHz`}
                  color="primary"
                  variant="outlined"
                  sx={{ width: '100%', fontWeight: 600 }}
                />
              </Box>
            )}

            {selectedItem === 'currents' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Branch Currents
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Computed current distribution on antenna edges.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Visualization controls will be added in Day 5.
                </Typography>
              </>
            )}
            {selectedItem === 'voltages' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Node Voltages
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Computed potential at antenna nodes.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Visualization controls will be added in Day 5.
                </Typography>
              </>
            )}
            {selectedItem === 'directivity' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Directivity Pattern
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Far-field radiation pattern showing antenna directivity.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  2D polar plots and 3D visualization coming in Day 5.
                </Typography>
              </>
            )}
            {requestedFields.find(f => f.id === selectedItem) && (() => {
              const field = requestedFields.find(f => f.id === selectedItem)!;
              const isComputed = fieldResults?.[field.id]?.computed ?? false;
              const numPoints = fieldResults?.[field.id]?.num_points;
              return (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    {field.name || 'Field Region'}
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Type
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {field.type} Region - {field.shape}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Center
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      ({field.centerPoint[0]}, {field.centerPoint[1]}, {field.centerPoint[2]}) mm
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Status
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {isComputed ? `Computed (${numPoints} points)` : 'Pending computation'}
                    </Typography>
                  </Paper>

                  {isComputed && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                        Visualization Settings
                      </Typography>

                      {/* Visualization Mode */}
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Display Mode
                        </Typography>
                        <ToggleButtonGroup
                          value={visualizationMode}
                          exclusive
                          onChange={(_, newMode) => {
                            if (newMode !== null) setVisualizationMode(newMode);
                          }}
                          size="small"
                          fullWidth
                        >
                          <ToggleButton value="magnitude">Magnitude</ToggleButton>
                          <ToggleButton value="vectorial">Vectorial</ToggleButton>
                          <ToggleButton value="component">Component</ToggleButton>
                          <ToggleButton value="phase">Phase</ToggleButton>
                        </ToggleButtonGroup>
                      </Box>

                      {/* Component Selector (only for component mode) */}
                      {visualizationMode === 'component' && (
                        <Box sx={{ mb: 3 }}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Component</InputLabel>
                            <Select
                              value={selectedComponent}
                              label="Component"
                              onChange={(e: SelectChangeEvent<Component>) => 
                                setSelectedComponent(e.target.value as Component)
                              }
                            >
                              <MenuItem value="x">X Component</MenuItem>
                              <MenuItem value="y">Y Component</MenuItem>
                              <MenuItem value="z">Z Component</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>
                      )}

                      {/* Complex Value Part Selector (for component and phase modes) */}
                      {(visualizationMode === 'component' || visualizationMode === 'phase') && (
                        <Box sx={{ mb: 3 }}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Value</InputLabel>
                            <Select
                              value={complexPart}
                              label="Value"
                              onChange={(e: SelectChangeEvent<ComplexPart>) => 
                                setComplexPart(e.target.value as ComplexPart)
                              }
                            >
                              <MenuItem value="magnitude">Magnitude</MenuItem>
                              <MenuItem value="real">Real Part</MenuItem>
                              <MenuItem value="imaginary">Imaginary Part</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>
                      )}

                      {/* Color Map */}
                      <Box sx={{ mb: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Color Map</InputLabel>
                          <Select
                            value={colorMap}
                            label="Color Map"
                            onChange={(e: SelectChangeEvent<ColorMapType>) => 
                              setColorMap(e.target.value as ColorMapType)
                            }
                          >
                            <MenuItem value="jet">Jet</MenuItem>
                            <MenuItem value="turbo">Turbo</MenuItem>
                            <MenuItem value="viridis">Viridis</MenuItem>
                            <MenuItem value="plasma">Plasma</MenuItem>
                            <MenuItem value="twilight">Twilight</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      {/* Opacity Slider */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Opacity: {opacity}%
                        </Typography>
                        <Slider
                          value={opacity}
                          onChange={(_, newValue) => setOpacity(newValue as number)}
                          min={0}
                          max={100}
                          step={5}
                          marks={[
                            { value: 0, label: '0%' },
                            { value: 50, label: '50%' },
                            { value: 100, label: '100%' },
                          ]}
                          valueLabelDisplay="auto"
                          size="small"
                        />
                      </Box>

                      <Typography variant="caption" color="text.secondary">
                        3D visualization rendering coming soon.
                      </Typography>
                    </>
                  )}

                  {!isComputed && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="caption" color="text.secondary">
                        Visualization settings will be available after field computation.
                      </Typography>
                    </>
                  )}
                </>
              );
            })()}
          </Box>
        )}
      </Box>
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
