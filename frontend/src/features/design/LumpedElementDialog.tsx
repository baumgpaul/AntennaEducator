import React, { useState, useEffect, useMemo } from 'react';
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
  Paper,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AntennaElement } from '@/types/models';

// Factory: create Zod schema with dynamic node range validation
const createLumpedElementSchema = (maxNodeIndex: number) => {
  const nodeValidator = z.number().int('Node must be an integer').refine(
    (v) => v <= 0 || v <= maxNodeIndex,
    { message: `Mesh node index must be ≤ ${maxNodeIndex}` },
  );

  return z.discriminatedUnion('element_type', [
    z.object({
      antennaId: z.string().min(1, 'Must select an antenna'),
      element_type: z.literal('R'),
      resistance: z.number().positive('Resistance must be positive'),
      node1: nodeValidator,
      node2: nodeValidator,
    }),
    z.object({
      antennaId: z.string().min(1, 'Must select an antenna'),
      element_type: z.literal('L'),
      inductance: z.number().positive('Inductance must be positive'),
      node1: nodeValidator,
      node2: nodeValidator,
    }),
    z.object({
      antennaId: z.string().min(1, 'Must select an antenna'),
      element_type: z.literal('C'),
      capacitance: z.number().positive('Capacitance must be positive'),
      node1: nodeValidator,
      node2: nodeValidator,
    }),
  ]).refine(
    (data) => data.node1 !== data.node2,
    {
      message: 'Node1 and Node2 must be different',
      path: ['node2'],
    }
  );
};

type LumpedElementFormData = z.infer<ReturnType<typeof createLumpedElementSchema>>;

interface LumpedElementDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: LumpedElementFormData) => Promise<void>;
  loading?: boolean;
  maxNodeIndex?: number;
  elements: AntennaElement[];
}

export const LumpedElementDialog: React.FC<LumpedElementDialogProps> = ({
  open,
  onClose,
  onAdd,
  loading = false,
  maxNodeIndex = 0,
  elements,
}) => {
  const [adding, setAdding] = useState(false);

  const lumpedElementSchema = useMemo(() => createLumpedElementSchema(maxNodeIndex), [maxNodeIndex]);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<LumpedElementFormData>({
    resolver: zodResolver(lumpedElementSchema),
    defaultValues: {
      antennaId: elements[0]?.id || '',
      element_type: 'R',
      resistance: 50,
      node1: 0,
      node2: 1,
    },
  });

  const elementType = watch('element_type');
  const selectedAntennaId = watch('antennaId');
  const selectedAntenna = elements.find(el => el.id === selectedAntennaId);

  // Reset form fields when element type changes
  useEffect(() => {
    if (elementType === 'R') {
      reset({
        antennaId: selectedAntennaId || elements[0]?.id || '',
        element_type: 'R',
        resistance: 50,
        node1: 0,
        node2: 1,
      });
    } else if (elementType === 'L') {
      reset({
        antennaId: selectedAntennaId || elements[0]?.id || '',
        element_type: 'L',
        inductance: 1e-9,
        node1: 0,
        node2: 1,
      });
    } else if (elementType === 'C') {
      reset({
        antennaId: selectedAntennaId || elements[0]?.id || '',
        element_type: 'C',
        capacitance: 1e-12,
        node1: 0,
        node2: 1,
      });
    }
  }, [elementType, reset]);

  const handleFormSubmit = async (data: LumpedElementFormData) => {
    setAdding(true);
    try {
      // Convert capacitance (F) → inverse capacitance (1/F) for the backend
      const submitData = data.element_type === 'C'
        ? { ...data, capacitance_inv: 1 / data.capacitance }
        : data;
      await onAdd(submitData as any);
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
            {/* Antenna Display */}
            {selectedAntenna && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Antenna
                  </Typography>
                  <Typography variant="h6">
                    {selectedAntenna.name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {selectedAntenna.type}
                  </Typography>
                </Paper>
              </Grid>
            )}

            {/* Antenna Selection */}
            <Grid item xs={12}>
              <Controller
                name="antennaId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.antennaId}>
                    <InputLabel>Antenna</InputLabel>
                    <Select
                      {...field}
                      label="Antenna"
                      disabled={loading || elements.length === 0}
                    >
                      {elements.map((antenna) => (
                        <MenuItem key={antenna.id} value={antenna.id}>
                          {antenna.name} ({antenna.type})
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.antennaId && (
                      <FormHelperText>{errors.antennaId.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            {/* Element Type */}
            <Grid item xs={12}>
              <FormControl fullWidth error={!!errors.element_type}>
                <InputLabel id="element-type-label">Element Type</InputLabel>
                <Select
                  labelId="element-type-label"
                  id="element-type-select"
                  label="Element Type"
                  value={elementType}
                  onChange={(e) => {
                    const value = e.target.value as string;
                    const baseData = {
                      antennaId: selectedAntennaId || elements[0]?.id || '',
                      node1: 0,
                      node2: 1,
                    };

                    // Construct type-safe form data based on element type
                    if (value === 'R') {
                      reset({ ...baseData, element_type: 'R', resistance: 50 } as any);
                    } else if (value === 'L') {
                      reset({ ...baseData, element_type: 'L', inductance: 1e-9 } as any);
                    } else if (value === 'C') {
                      reset({ ...baseData, element_type: 'C', capacitance: 1e-12 } as any);
                    }
                  }}
                  disabled={loading || adding}
                >
                  <MenuItem value="R">R - Resistor</MenuItem>
                  <MenuItem value="L">L - Inductor</MenuItem>
                  <MenuItem value="C">C - Capacitor</MenuItem>
                </Select>
                {errors.element_type && (
                  <FormHelperText>{errors.element_type.message}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Element-specific fields */}
            {(elementType === 'R') && (
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

            {(elementType === 'L') && (
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

            {(elementType === 'C') && (
              <Grid item xs={12}>
                <Controller
                  name="capacitance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Capacitance (F)"
                      type="number"
                      fullWidth
                      error={!!(errors as any).capacitance}
                      helperText={(errors as any).capacitance?.message || 'Use scientific notation (e.g., 1e-12 for 1 pF)'}
                      inputProps={{ step: 1e-13 }}
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
                    type="text"
                    inputMode="numeric"
                    fullWidth
                    error={!!errors.node1}
                    helperText={errors.node1?.message || 'Integer: positive (mesh), 0 (GND), negative (appended)'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === '-') {
                        field.onChange(val);
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          field.onChange(num);
                        }
                      }
                    }}
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
                    type="text"
                    inputMode="numeric"
                    fullWidth
                    error={!!errors.node2}
                    helperText={errors.node2?.message || 'Integer: positive (mesh), 0 (GND), negative (appended)'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === '-') {
                        field.onChange(val);
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          field.onChange(num);
                        }
                      }
                    }}
                  />
                )}
              />
            </Grid>

            {/* Info Alert */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Lumped Elements:</strong> Add discrete components between mesh nodes.
                <br />
                <strong>Node Indexing:</strong> Positive (mesh nodes), 0 (ground), Negative (appended network)
                <br />
                <strong>Resistor:</strong> Loading, matching networks
                <br />
                <strong>Inductor:</strong> Inductive loading
                <br />
                <strong>Capacitor:</strong> Capacitive loading
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
