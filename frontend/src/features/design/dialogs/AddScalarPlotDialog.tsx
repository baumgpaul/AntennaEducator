/**
 * AddScalarPlotDialog - Dialog for adding scalar result plots to Line views
 * Select plot type (impedance/voltage/current) and port number
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
  TextField,
  Box,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setAddScalarPlotDialogOpen,
  addItemToView,
  selectAddScalarPlotDialogOpen,
  selectSelectedViewId,
  selectSelectedView,
} from '@/store/postprocessingSlice';
import type { ViewItemType } from '@/types/postprocessing';

type PlotType = 'impedance-plot' | 'voltage-plot' | 'current-plot';

function AddScalarPlotDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddScalarPlotDialogOpen);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedView = useAppSelector(selectSelectedView);
  
  const [plotType, setPlotType] = useState<PlotType>('impedance-plot');
  const [portNumber, setPortNumber] = useState<number>(1);

  const handleClose = () => {
    dispatch(setAddScalarPlotDialogOpen(false));
    setPlotType('impedance-plot');
    setPortNumber(1);
  };

  const handleSubmit = () => {
    if (!selectedViewId) return;

    // Validate: only Line views can have scalar plots
    if (selectedView?.viewType !== 'Line') {
      console.error('Scalar plots can only be added to Line views');
      return;
    }

    const labels: Record<PlotType, string> = {
      'impedance-plot': 'Impedance',
      'voltage-plot': `Voltage (Port ${portNumber})`,
      'current-plot': `Current (Port ${portNumber})`,
    };

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: plotType as ViewItemType,
        visible: true,
        portNumber: plotType !== 'impedance-plot' ? portNumber : undefined,
        label: labels[plotType],
      },
    }));

    handleClose();
  };

  const requiresPort = plotType !== 'impedance-plot';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Scalar Plot</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Plot Type */}
          <FormControl fullWidth>
            <InputLabel>Plot Type</InputLabel>
            <Select
              value={plotType}
              onChange={(e) => setPlotType(e.target.value as PlotType)}
              label="Plot Type"
            >
              <MenuItem value="impedance-plot">Impedance vs Frequency</MenuItem>
              <MenuItem value="voltage-plot">Voltage vs Frequency</MenuItem>
              <MenuItem value="current-plot">Current vs Frequency</MenuItem>
            </Select>
          </FormControl>

          {/* Port Number (for voltage/current only) */}
          {requiresPort && (
            <TextField
              label="Port Number"
              type="number"
              value={portNumber}
              onChange={(e) => setPortNumber(parseInt(e.target.value, 10) || 1)}
              inputProps={{ min: 1, max: 10 }}
              fullWidth
              helperText="Port number to plot"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
        >
          Add Plot
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddScalarPlotDialog;
