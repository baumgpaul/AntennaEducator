/**
 * AddFieldVisualizationDialog - 2-step dialog for adding field visualizations
 * Step 1: Select field from requestedFields
 * Step 2: Choose visualization mode (magnitude or vector)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Box,
  Alert,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setAddFieldDialogOpen,
  addItemToView,
  selectAddFieldDialogOpen,
  selectSelectedViewId,
} from '@/store/postprocessingSlice';
import { selectRequestedFields } from '@/store/solverSlice';

type VisualizationMode = 'magnitude' | 'vector';

function AddFieldVisualizationDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddFieldDialogOpen);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const requestedFields = useAppSelector(selectRequestedFields);
  
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [mode, setMode] = useState<VisualizationMode>('magnitude');

  const steps = ['Select Field', 'Visualization Mode'];

  const handleClose = () => {
    dispatch(setAddFieldDialogOpen(false));
    // Reset state
    setActiveStep(0);
    setSelectedFieldId('');
    setMode('magnitude');
  };

  const handleNext = () => {
    if (activeStep === 0 && selectedFieldId) {
      setActiveStep(1);
    }
  };

  const handleBack = () => {
    setActiveStep(0);
  };

  const handleSubmit = () => {
    if (!selectedViewId || !selectedFieldId) return;

    const field = requestedFields.find(f => f.id === selectedFieldId);
    if (!field) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: mode === 'magnitude' ? 'field-magnitude' : 'field-vector',
        visible: true,
        fieldId: selectedFieldId,
        label: `${field.name || 'Field'} (${mode})`,
        colorMap: 'jet',
        opacity: 0.8,
      },
    }));

    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Field Visualization</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {/* Stepper */}
          <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Step 1: Select Field */}
          {activeStep === 0 && (
            <>
              {requestedFields.length === 0 ? (
                <Alert severity="info">
                  No fields available. Define field regions in the Solver tab first.
                </Alert>
              ) : (
                <FormControl fullWidth>
                  <InputLabel>Select Field</InputLabel>
                  <Select
                    value={selectedFieldId}
                    onChange={(e) => setSelectedFieldId(e.target.value)}
                    label="Select Field"
                  >
                    {requestedFields.map((field) => (
                      <MenuItem key={field.id} value={field.id}>
                        {field.name || `Field ${field.id}`} ({field.type} {field.shape})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          )}

          {/* Step 2: Visualization Mode */}
          {activeStep === 1 && (
            <FormControl component="fieldset">
              <FormLabel component="legend">Visualization Mode</FormLabel>
              <RadioGroup
                value={mode}
                onChange={(e) => setMode(e.target.value as VisualizationMode)}
              >
                <FormControlLabel
                  value="magnitude"
                  control={<Radio />}
                  label="Magnitude - Color-mapped scalar field surface"
                />
                <FormControlLabel
                  value="vector"
                  control={<Radio />}
                  label="Vector - Arrow field visualization"
                />
              </RadioGroup>
            </FormControl>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {activeStep > 0 && (
          <Button onClick={handleBack}>Back</Button>
        )}
        {activeStep === 0 ? (
          <Button
            onClick={handleNext}
            variant="contained"
            disabled={!selectedFieldId || requestedFields.length === 0}
          >
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} variant="contained">
            Add Field
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default AddFieldVisualizationDialog;
