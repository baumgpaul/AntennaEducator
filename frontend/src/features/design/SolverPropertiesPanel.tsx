import { Box, Typography, Checkbox, FormControlLabel, Slider, Paper, Divider } from '@mui/material';

/**
 * SolverPropertiesPanel - Right-side panel for solver tab
 * 
 * Shows:
 * - Field region visibility and opacity controls
 * - Selected field properties (future implementation)
 * - Empty state when nothing selected
 */

interface SolverPropertiesPanelProps {
  selectedFieldId?: string;
  fieldRegionsVisible: boolean;
  fieldRegionOpacity: number;
  onFieldRegionsVisibleChange: (visible: boolean) => void;
  onFieldRegionOpacityChange: (opacity: number) => void;
}

export function SolverPropertiesPanel({
  selectedFieldId,
  fieldRegionsVisible,
  fieldRegionOpacity,
  onFieldRegionsVisibleChange,
  onFieldRegionOpacityChange,
}: SolverPropertiesPanelProps) {
  const handleOpacityChange = (_event: Event, value: number | number[]) => {
    onFieldRegionOpacityChange((value as number) / 100); // Convert 0-100 to 0-1
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Field Region Display Settings */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Field Region Display
        </Typography>
        
        <Divider sx={{ my: 1.5 }} />
        
        {/* Visibility toggle */}
        <FormControlLabel
          control={
            <Checkbox
              checked={fieldRegionsVisible}
              onChange={(e) => {
                console.log('[SolverPropertiesPanel] Checkbox clicked:', e.target.checked);
                onFieldRegionsVisibleChange(e.target.checked);
              }}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Show Field Regions
            </Typography>
          }
          sx={{ mb: 2 }}
        />

        {/* Opacity slider */}
        <Box>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Opacity: {Math.round(fieldRegionOpacity * 100)}%
          </Typography>
          <Slider
            value={fieldRegionOpacity * 100}
            onChange={handleOpacityChange}
            min={0}
            max={100}
            step={5}
            disabled={!fieldRegionsVisible}
            size="small"
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}%`}
            sx={{ mt: 1 }}
          />
        </Box>
      </Paper>

      {/* Field Properties Editor - Will be implemented in next task */}
      {selectedFieldId ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Field Properties
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2" color="text.secondary">
            Field property editor coming soon...
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ color: 'text.secondary', textAlign: 'center', mt: 4 }}>
          <Typography variant="body2">
            Select a field region in the tree view to edit its properties
          </Typography>
        </Box>
      )}
    </Box>
  );
}
