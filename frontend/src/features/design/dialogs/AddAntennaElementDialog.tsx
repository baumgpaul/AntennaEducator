/**
 * AddAntennaElementDialog - Dialog for adding individual antenna elements to a view
 * Dropdown selector from Designer's element list
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
  Box,
  Alert,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setAddAntennaDialogOpen,
  addItemToView,
  selectAddAntennaDialogOpen,
  selectSelectedViewId,
} from '@/store/postprocessingSlice';

function AddAntennaElementDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddAntennaDialogOpen);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const elements = useAppSelector((state) => state.design.elements);
  
  const [selectedElementId, setSelectedElementId] = useState('');

  const handleClose = () => {
    dispatch(setAddAntennaDialogOpen(false));
    setSelectedElementId('');
  };

  const handleSubmit = () => {
    if (!selectedViewId || !selectedElementId) return;

    const element = elements.find(el => el.id === selectedElementId);
    if (!element) return;

    dispatch(addItemToView({
      viewId: selectedViewId,
      item: {
        type: 'antenna-element',
        visible: true,
        antennaId: selectedElementId,
        label: element.name || element.type, // Use element name or type
      },
    }));

    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Antenna Element</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {elements.length === 0 ? (
            <Alert severity="info">
              No antennas available. Create antennas in the Designer tab first.
            </Alert>
          ) : (
            <FormControl fullWidth>
              <InputLabel>Select Antenna</InputLabel>
              <Select
                value={selectedElementId}
                onChange={(e) => setSelectedElementId(e.target.value)}
                label="Select Antenna"
              >
                {elements.map((element) => (
                  <MenuItem key={element.id} value={element.id}>
                    {element.name || element.type} ({element.type})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!selectedElementId || elements.length === 0}
        >
          Add Element
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddAntennaElementDialog;
