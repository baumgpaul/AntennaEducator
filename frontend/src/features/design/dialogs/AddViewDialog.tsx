/**
 * AddViewDialog - Dialog for creating new view configurations
 * Supports 5 view types: 3D, Line, Smith, Polar, Table
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
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RadarIcon from '@mui/icons-material/Radar';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setAddViewDialogOpen,
  createViewConfiguration,
  selectAddViewDialogOpen,
  selectViewConfigurations,
} from '@/store/postprocessingSlice';
import type { ViewType } from '@/types/postprocessing';
import { MAX_VIEW_CONFIGURATIONS } from '@/types/postprocessing';
import Alert from '@mui/material/Alert';

const VIEW_TYPE_OPTIONS: Array<{
  value: ViewType;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: '3D',
    label: '3D View',
    description: 'Visualize antennas, fields, and directivity patterns',
    icon: <ViewInArIcon fontSize="small" sx={{ mr: 0.5 }} />,
  },
  {
    value: 'Line',
    label: 'Line Plot',
    description: 'X-Y line plots for any quantity (impedance, fields, etc.)',
    icon: <ShowChartIcon fontSize="small" sx={{ mr: 0.5 }} />,
  },
  {
    value: 'Smith',
    label: 'Smith Chart',
    description: 'Impedance locus on Smith chart',
    icon: <RadarIcon fontSize="small" sx={{ mr: 0.5 }} />,
  },
  {
    value: 'Polar',
    label: 'Polar Plot',
    description: 'Radiation pattern cuts (phi/theta)',
    icon: <PieChartIcon fontSize="small" sx={{ mr: 0.5 }} />,
  },
  {
    value: 'Table',
    label: 'Table View',
    description: 'Port quantities in tabular form (Z, S₁₁, VSWR)',
    icon: <TableChartIcon fontSize="small" sx={{ mr: 0.5 }} />,
  },
];

function AddViewDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectAddViewDialogOpen);
  const viewConfigurations = useAppSelector(selectViewConfigurations);
  const atLimit = viewConfigurations.length >= MAX_VIEW_CONFIGURATIONS;

  const [name, setName] = useState('');
  const [viewType, setViewType] = useState<ViewType>('3D');

  const handleClose = () => {
    dispatch(setAddViewDialogOpen(false));
    setName('');
    setViewType('3D');
  };

  const handleSubmit = () => {
    if (atLimit) return;
    dispatch(createViewConfiguration({
      name: name.trim() || undefined,
      viewType,
    }));
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New View</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {atLimit && (
            <Alert severity="warning">
              Maximum of {MAX_VIEW_CONFIGURATIONS} views reached. Delete an existing view to create a new one.
            </Alert>
          )}
          <TextField
            label="View Name (Optional)"
            placeholder="Result View 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            helperText="Leave blank to auto-generate (Result View 1, 2, 3...)"
          />

          <FormControl component="fieldset">
            <FormLabel component="legend">View Type</FormLabel>
            <RadioGroup
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
            >
              {VIEW_TYPE_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {opt.icon}
                      <span>{opt.label} — {opt.description}</span>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={atLimit}>
          Create View
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddViewDialog;
