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
import { TRACE_COLORS } from '@/types/plotDefinitions';

function AddScalarPlotDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddScalarPlotDialogOpen);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const selectedView = useAppSelector(selectSelectedView);
  const preselect = useAppSelector((state: RootState) => state.postprocessing.scalarPlotPreselect);

  const [dataType, setDataType] = useState<
    'impedance_real' | 'impedance_imag' | 'impedance_magnitude' | 'vswr' | 'return_loss'
  >('impedance_real');

  // Apply preselect when dialog opens
  useEffect(() => {
    if (open && preselect) {
      if (preselect === 'impedance') {
        setDataType('impedance_real');
      }
    }
  }, [open, preselect]);

  const handleClose = () => {
    dispatch(setAddScalarPlotDialogOpen(false));
    setDataType('impedance_real');
  };

  const handleSubmit = () => {
    if (!selectedViewId) return;

    // Validate: only Line views can have scalar plots
    if (selectedView?.viewType !== 'Line') {
      console.error('Scalar plots can only be added to Line views');
      return;
    }

    const labels: Record<string, string> = {
      impedance_real: 'Re(Z)',
      impedance_imag: 'Im(Z)',
      impedance_magnitude: '|Z|',
      vswr: 'VSWR',
      return_loss: 'Return Loss',
    };

    const yAxisByType: Record<string, { label: string; unit: string; scale: 'linear' | 'log' | 'dB' }> = {
      impedance_real: { label: 'Impedance', unit: 'Ohm', scale: 'linear' },
      impedance_imag: { label: 'Impedance', unit: 'Ohm', scale: 'linear' },
      impedance_magnitude: { label: 'Impedance', unit: 'Ohm', scale: 'linear' },
      vswr: { label: 'VSWR', unit: '', scale: 'linear' },
      return_loss: { label: 'Return Loss', unit: 'dB', scale: 'dB' },
    };

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'line-plot',
        visible: true,
        label: labels[dataType],
        traces: [
          {
            id: `trace_${Date.now()}`,
            quantity: {
              source: 'port',
              quantity: dataType,
            },
            label: labels[dataType],
            color: TRACE_COLORS[0],
            lineStyle: 'solid',
            yAxisId: 'left',
          },
        ],
        xAxisConfig: {
          label: 'Frequency',
          unit: 'MHz',
          scale: 'linear',
        },
        yAxisLeftConfig: yAxisByType[dataType],
        yAxisRightConfig: {
          label: '',
          unit: '',
          scale: 'linear',
        },
      },
    }));

    handleClose();
  };

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
              onChange={(e) =>
                setDataType(
                  e.target.value as
                    | 'impedance_real'
                    | 'impedance_imag'
                    | 'impedance_magnitude'
                    | 'vswr'
                    | 'return_loss',
                )
              }
              label="Data Type"
            >
              <MenuItem value="impedance_real">Re(Z) vs Sweep Variable</MenuItem>
              <MenuItem value="impedance_imag">Im(Z) vs Sweep Variable</MenuItem>
              <MenuItem value="impedance_magnitude">|Z| vs Sweep Variable</MenuItem>
              <MenuItem value="vswr">VSWR vs Sweep Variable</MenuItem>
              <MenuItem value="return_loss">Return Loss vs Sweep Variable</MenuItem>
            </Select>
          </FormControl>
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
