/**
 * AddViewDialog - Dialog for creating new view configurations
 * Simple 2-field form: name (optional) and view type (3D or Line)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  FormControl,
  Box,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setAddViewDialogOpen,
  createViewConfiguration,
  selectAddViewDialogOpen,
} from '@/store/postprocessingSlice';
import type { ViewType } from '@/types/postprocessing';

function AddViewDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddViewDialogOpen);
  
  const [name, setName] = useState('');
  const [viewType, setViewType] = useState<ViewType>('3D');

  const handleClose = () => {
    dispatch(setAddViewDialogOpen(false));
    // Reset form
    setName('');
    setViewType('3D');
  };

  const handleSubmit = () => {
    dispatch(createViewConfiguration({
      name: name.trim() || undefined, // Use default name if empty
      viewType,
    }));
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New View</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* View Name */}
          <TextField
            label="View Name (Optional)"
            placeholder="Result View 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            helperText="Leave blank to auto-generate (Result View 1, 2, 3...)"
          />

          {/* View Type */}
          <FormControl component="fieldset">
            <FormLabel component="legend">View Type</FormLabel>
            <RadioGroup
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
            >
              <FormControlLabel
                value="3D"
                control={<Radio />}
                label="3D View - Visualize antennas, fields, and directivity patterns"
              />
              <FormControlLabel
                value="Line"
                control={<Radio />}
                label="Line View - Plot impedance, voltage, and current curves"
              />
            </RadioGroup>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          Create View
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddViewDialog;
