/**
 * AddScalarPlotDialog - Dialog for adding scalar result plots to Line views
 * Select plot type (impedance/voltage/current) and port number
 */

import { useState, useEffect } from 'react';
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
import type { RootState } from '@/store/store';

function AddScalarPlotDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddScalarPlotDialogOpen);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedView = useAppSelector(selectSelectedView);
  const preselect = useAppSelector((state: RootState) => state.postprocessing.scalarPlotPreselect);

  const [dataType, setDataType] = useState<'impedance' | 'voltage' | 'current'>('impedance');
  const [portNumber, setPortNumber] = useState<number>(1);

  // Apply preselect when dialog opens
  useEffect(() => {
    if (open && preselect) {
      setDataType(preselect);
    }
  }, [open, preselect]);

  const handleClose = () => {
    dispatch(setAddScalarPlotDialogOpen(false));
    setDataType('impedance');
    setPortNumber(1);
  };

  const handleSubmit = () => {
    if (!selectedViewId) return;

    // Validate: only Line views can have scalar plots
    if (selectedView?.viewType !== 'Line') {
      console.error('Scalar plots can only be added to Line views');
      return;
    }

    const labels: Record<string, string> = {
      'impedance': 'Impedance',
      'voltage': `Voltage (Port ${portNumber})`,
      'current': `Current (Port ${portNumber})`,
    };

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'scalar-plot',
        visible: true,
        portNumber: dataType !== 'impedance' ? portNumber : undefined,
        label: labels[dataType],
      },
    }));

    handleClose();
  };

  const requiresPort = dataType !== 'impedance';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Scalar Plot</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Plot Type */}
          <FormControl fullWidth>
            <InputLabel>Data Type</InputLabel>
            <Select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as 'impedance' | 'voltage' | 'current')}
              label="Data Type"
            >
              <MenuItem value="impedance">Impedance vs Frequency</MenuItem>
              <MenuItem value="voltage">Voltage vs Frequency</MenuItem>
              <MenuItem value="current">Current vs Frequency</MenuItem>
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
