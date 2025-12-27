import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Typography,
  Paper,
} from '@mui/material';
import { AntennaElement } from '@/types/models';

// Zod schema for voltage source
const sourceSchema = z.object({
  antennaId: z.string().min(1, 'Must select an antenna'),
  type: z.enum(['voltage', 'current']),
  node1: z.number().int('Must be integer'),
  node2: z.number().int('Must be integer'),
  value: z.number().positive('Value must be positive'),
  seriesR: z.number().nonnegative('Series resistance must be non-negative'),
  seriesL: z.number().nonnegative('Series inductance must be non-negative'),
  seriesC: z.number().nonnegative('Series capacitance must be non-negative'),
}).refine(
  (data) => data.node1 !== data.node2,
  {
    message: 'Node 1 and Node 2 must be different',
    path: ['node2'],
  }
);

type SourceFormData = z.infer<typeof sourceSchema>;

interface SourceDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (source: SourceFormData) => Promise<void>;
  loading?: boolean;
  maxNodeIndex?: number;
  elements: AntennaElement[];
}

export const SourceDialog: React.FC<SourceDialogProps> = ({
  open,
  onClose,
  onAdd,
  loading = false,
  maxNodeIndex = 0,
  elements,
}) => {
  const [adding, setAdding] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<SourceFormData>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      antennaId: elements[0]?.id || '',
      type: 'voltage',
      node1: 0,
      node2: 1,
      value: 1.0,
      seriesR: 0,
      seriesL: 0,
      seriesC: 0,
    },
  });

  const sourceType = watch('type');
  const selectedAntennaId = watch('antennaId');
  const selectedAntenna = elements.find(el => el.id === selectedAntennaId);

  const handleClose = () => {
    if (!adding && !loading) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: SourceFormData) => {
    setAdding(true);
    try {
      await onAdd(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to add source:', error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Add Source</Typography>
        <Typography variant="caption" color="text.secondary">
          Add voltage or current source to antenna
        </Typography>
      </DialogTitle>

      <form id="source-form" onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Selected Antenna Display */}
            {selectedAntenna && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Antenna
                  </Typography>
                  <Typography variant="h6">
                    {selectedAntenna.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Type: {selectedAntenna.type}
                  </Typography>
                </Paper>
              </Grid>
            )}

            {/* Antenna Selection */}
            {elements.length > 1 && (
              <Grid item xs={12}>
                <Controller
                  name="antennaId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Select Antenna</InputLabel>
                      <Select
                        {...field}
                        label="Select Antenna"
                      >
                        {elements.map((el) => (
                          <MenuItem key={el.id} value={el.id}>
                            {el.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
            )}

            {/* Source Type */}
            <Grid item xs={12}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Source Type</InputLabel>
                    <Select
                      {...field}
                      label="Source Type"
                    >
                      <MenuItem value="voltage">Voltage Source</MenuItem>
                      <MenuItem value="current">Current Source</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            {/* Node 1 */}
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

            {/* Node 2 */}
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

            {/* Value */}
            <Grid item xs={12}>
              <Controller
                name="value"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={sourceType === 'voltage' ? 'Voltage (V)' : 'Current (A)'}
                    type="number"
                    fullWidth
                    error={!!errors.value}
                    helperText={errors.value?.message || ''}
                    inputProps={{ step: 0.1, min: 0 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Series Components */}
            <Grid item xs={4}>
              <Controller
                name="seriesR"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Series R (Ω)"
                    type="number"
                    fullWidth
                    error={!!errors.seriesR}
                    helperText={errors.seriesR?.message || ''}
                    inputProps={{ step: 0.1, min: 0 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="seriesL"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Series L (H)"
                    type="number"
                    fullWidth
                    error={!!errors.seriesL}
                    helperText={errors.seriesL?.message || ''}
                    inputProps={{ step: 0.01e-9, min: 0 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="seriesC"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Series C (F)"
                    type="number"
                    fullWidth
                    error={!!errors.seriesC}
                    helperText={errors.seriesC?.message || ''}
                    inputProps={{ step: 0.01e-12, min: 0 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Info Alert */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Node Indexing:</strong> Positive (mesh nodes), 0 (ground), Negative (appended network)
                <br />
                <strong>Source Type:</strong> Voltage source connects between two nodes, current source delivers fixed current
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={adding || loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="source-form"
            variant="contained"
            disabled={adding || loading || maxNodeIndex === 0}
            startIcon={adding || loading ? <CircularProgress size={20} /> : null}
          >
            {adding || loading ? 'Adding...' : 'Add Source'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
