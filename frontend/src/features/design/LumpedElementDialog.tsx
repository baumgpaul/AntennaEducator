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
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { LumpedElementFormInput } from '@/api/preprocessor';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AntennaElement } from '@/types/models';
import { meshNodeLimit } from '@/utils/meshNodeLimit';


/** Per-antenna node range check (the limit depends on the selected antenna). */
const checkNodeRange = (
  limitFor: (antennaId: string) => number,
  data: { antennaId: string; node1: number; node2: number },
  ctx: z.RefinementCtx,
) => {
  const limit = limitFor(data.antennaId);
  for (const field of ['node1', 'node2'] as const) {
    if (data[field] > limit) {
      ctx.addIssue({ code: 'custom', path: [field], message: `Mesh node index must be ≤ ${limit}` });
    }
  }
};

// Factory: create Zod schema with node range validation per selected antenna
const createLumpedElementSchema = (limitFor: (antennaId: string) => number) => {
  const nodeValidator = z.number().int('Node must be an integer');

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
  ).superRefine((data, ctx) => checkNodeRange(limitFor, data, ctx));
};

type LumpedElementFormData = z.infer<ReturnType<typeof createLumpedElementSchema>>;

/** Value fields of the three variants (the form's error object is a union of them) */
type ValueErrors = Partial<Record<'resistance' | 'inductance' | 'capacitance', { message?: string }>>;

interface LumpedElementDialogProps {
  open: boolean;
  onClose: () => void;
  /** Capacitors are passed with capacitance_inv (1/C) for the backend */
  onAdd: (data: LumpedElementFormInput) => Promise<void>;
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

  const lumpedElementSchema = useMemo(
    () => createLumpedElementSchema((id) => meshNodeLimit(elements, id, maxNodeIndex)),
    [elements, maxNodeIndex],
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
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

  const elementType = useWatch({ control, name: 'element_type' });
  const selectedAntennaId = useWatch({ control, name: 'antennaId' });
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
    // Only when the element type changes: choosing an antenna (selectedAntennaId) must
    // not reset the values the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementType, reset]);

  const handleFormSubmit = async (data: LumpedElementFormData) => {
    setAdding(true);
    try {
      // Convert capacitance (F) → inverse capacitance (1/F) for the backend
      const submitData = data.element_type === 'C'
        ? { ...data, capacitance_inv: 1 / data.capacitance }
        : data;
      await onAdd(submitData);
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
              <Grid size={12}>
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
            <Grid size={12}>
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
            <Grid size={12}>
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
                      reset({ ...baseData, element_type: 'R' as const, resistance: 50 });
                    } else if (value === 'L') {
                      reset({ ...baseData, element_type: 'L' as const, inductance: 1e-9 });
                    } else if (value === 'C') {
                      reset({ ...baseData, element_type: 'C' as const, capacitance: 1e-12 });
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
              <Grid size={12}>
                <Controller
                  name="resistance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Resistance (Ω)"
                      type="number"
                      fullWidth
                      error={!!(errors as ValueErrors).resistance}
                      helperText={(errors as ValueErrors).resistance?.message}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      slotProps={{
                        htmlInput: { step: 0.1 }
                      }}
                    />
                  )}
                />
              </Grid>
            )}

            {(elementType === 'L') && (
              <Grid size={12}>
                <Controller
                  name="inductance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Inductance (H)"
                      type="number"
                      fullWidth
                      error={!!(errors as ValueErrors).inductance}
                      helperText={(errors as ValueErrors).inductance?.message || 'Use scientific notation (e.g., 1e-9)'}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      slotProps={{
                        htmlInput: { step: 1e-10 }
                      }}
                    />
                  )}
                />
              </Grid>
            )}

            {(elementType === 'C') && (
              <Grid size={12}>
                <Controller
                  name="capacitance"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Capacitance (F)"
                      type="number"
                      fullWidth
                      error={!!(errors as ValueErrors).capacitance}
                      helperText={(errors as ValueErrors).capacitance?.message || 'Use scientific notation (e.g., 1e-12 for 1 pF)'}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      slotProps={{
                        htmlInput: { step: 1e-13 }
                      }}
                    />
                  )}
                />
              </Grid>
            )}

            {/* Node Placement */}
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom>
                Node Placement
              </Typography>
            </Grid>
            <Grid size={6}>
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
            <Grid size={6}>
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
            <Grid size={12}>
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

            {meshNodeLimit(elements, selectedAntennaId, maxNodeIndex) === 0 && (
              <Grid size={12}>
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
          disabled={adding || loading || meshNodeLimit(elements, selectedAntennaId, maxNodeIndex) === 0}
          startIcon={adding || loading ? <CircularProgress size={20} /> : null}
        >
          {adding || loading ? 'Adding...' : 'Add Element'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
