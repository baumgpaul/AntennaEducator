import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Zod discriminated union schema for different element types
const lumpedElementSchema = z.discriminatedUnion('element_type', [
  z.object({
    element_type: z.literal('R'),
    resistance: z.number().positive('Resistance must be positive'),
    node1: z.number().int().min(0, 'Node must be non-negative'),
    node2: z.number().int().min(0, 'Node must be non-negative'),
  }),
  z.object({
    element_type: z.literal('L'),
    inductance: z.number().positive('Inductance must be positive'),
    node1: z.number().int().min(0, 'Node must be non-negative'),
    node2: z.number().int().min(0, 'Node must be non-negative'),
  }),
  z.object({
    element_type: z.literal('C'),
    capacitance_inv: z.number().positive('Capacitance inverse must be positive'),
    node1: z.number().int().min(0, 'Node must be non-negative'),
    node2: z.number().int().min(0, 'Node must be non-negative'),
  }),
  z.object({
    element_type: z.literal('RLC'),
    resistance: z.number().positive('Resistance must be positive'),
    inductance: z.number().positive('Inductance must be positive'),
    capacitance_inv: z.number().positive('Capacitance inverse must be positive'),
    node1: z.number().int().min(0, 'Node must be non-negative'),
    node2: z.number().int().min(0, 'Node must be non-negative'),
  }),
]).refine(
  (data) => data.node1 !== data.node2,
  {
    message: 'Node1 and Node2 must be different',
    path: ['node2'],
  }
);

type LumpedElementFormData = z.infer<typeof lumpedElementSchema>;

interface LumpedElementDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: LumpedElementFormData) => Promise<void>;
  loading?: boolean;
  maxNodeIndex?: number;
}

export const LumpedElementDialog: React.FC<LumpedElementDialogProps> = ({ 
  open, 
  onClose, 
  onAdd, 
  loading = false,
  maxNodeIndex = 0,
}) => {
  const [adding, setAdding] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<LumpedElementFormData>({
    resolver: zodResolver(lumpedElementSchema),
    defaultValues: {
      element_type: 'R',
      resistance: 50,
      node1: 0,
      node2: 1,
    },
  });

  const elementType = watch('element_type');

  // Reset form fields when element type changes
  useEffect(() => {
    if (elementType === 'R') {
      reset({
        element_type: 'R',
        resistance: 50,
        node1: 0,
        node2: 1,
      });
    } else if (elementType === 'L') {
      reset({
        element_type: 'L',
        inductance: 1e-9,
        node1: 0,
        node2: 1,
      });
    } else if (elementType === 'C') {
      reset({
        element_type: 'C',
        capacitance_inv: 1e9,
        node1: 0,
        node2: 1,
      });
    } else if (elementType === 'RLC') {
      reset({
        element_type: 'RLC',
        resistance: 50,
        inductance: 1e-9,
        capacitance_inv: 1e9,
        node1: 0,
        node2: 1,
      });
    }
  }, [elementType, reset]);

  const handleFormSubmit = async (data: LumpedElementFormData) => {
    setAdding(true);
    try {
      await onAdd(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to add lumped element:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    if (!adding && !loading) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Lumped Element</DialogTitle>
      <DialogContent>
        <form id="lumped-element-form" onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Element Type */}
            <Grid item xs={12}>
              <FormControl fullWidth error={!!errors.element_type}>
                <InputLabel>Element Type</InputLabel>
                <Controller
                  name="element_type"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label="Element Type">
                      <MenuItem value="R">Resistor (R)</MenuItem>
                      <MenuItem value="L">Inductor (L)</MenuItem>
                      <MenuItem value="C">Capacitor (C)</MenuItem>
                      <MenuItem value="RLC">RLC Series</MenuItem>
                    </Select>
                  )}
                />
                {errors.element_type && (
                  <FormHelperText>{errors.element_type.message}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Conditional Fields Based on Element Type */}
            {(elementType === 'R' || elementType === 'RLC') && (
              <Grid item xs={12}>
                <Controller
                  name="resistance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Resistance (Ω)"
                      type="number"
                      fullWidth
                      error={!!(errors as any).resistance}
                      helperText={(errors as any).resistance?.message}
                      inputProps={{ step: 0.1 }}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  )}
                />
              </Grid>
            )}

            {(elementType === 'L' || elementType === 'RLC') && (
              <Grid item xs={12}>
                <Controller
                  name="inductance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Inductance (H)"
                      type="number"
                      fullWidth
                      error={!!(errors as any).inductance}
                      helperText={(errors as any).inductance?.message || 'Use scientific notation (e.g., 1e-9)'}
                      inputProps={{ step: 1e-10 }}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  )}
                />
              </Grid>
            )}

            {(elementType === 'C' || elementType === 'RLC') && (
              <Grid item xs={12}>
                <Controller
                  name="capacitance_inv"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Inverse Capacitance (1/F)"
                      type="number"
                      fullWidth
                      error={!!(errors as any).capacitance_inv}
                      helperText={(errors as any).capacitance_inv?.message || '1/C (e.g., 1e9 for 1 pF)'}
                      inputProps={{ step: 1e6 }}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  )}
                />
              </Grid>
            )}

            {/* Node Placement */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Node Placement
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Controller
                name="node1"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Node 1"
                    type="number"
                    fullWidth
                    error={!!errors.node1}
                    helperText={errors.node1?.message || `Max: ${maxNodeIndex}`}
                    inputProps={{ step: 1, min: 0, max: maxNodeIndex }}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
            </Grid>
            <Grid item xs={6}>
              <Controller
                name="node2"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Node 2"
                    type="number"
                    fullWidth
                    error={!!errors.node2}
                    helperText={errors.node2?.message || `Max: ${maxNodeIndex}`}
                    inputProps={{ step: 1, min: 0, max: maxNodeIndex }}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Info Alert */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Lumped Elements:</strong>
                <br />
                Add discrete components between mesh nodes.
                <br />
                • <strong>Resistor:</strong> Loading, matching networks
                <br />
                • <strong>Inductor:</strong> Inductive loading
                <br />
                • <strong>Capacitor:</strong> Capacitive loading
                <br />
                • <strong>RLC:</strong> Resonant circuits
              </Alert>
            </Grid>

            {maxNodeIndex === 0 && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  <strong>Warning:</strong> No antenna mesh loaded. Generate an antenna first to see available nodes.
                </Alert>
              </Grid>
            )}
          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={adding || loading}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="lumped-element-form"
          variant="contained"
          disabled={adding || loading || maxNodeIndex === 0}
          startIcon={adding || loading ? <CircularProgress size={20} /> : null}
        >
          {adding || loading ? 'Adding...' : 'Add Element'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
