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
  CircularProgress,
  Typography,
  Paper,
} from '@mui/material';
import { AntennaElement } from '@/types/models';

// Zod schema for lumped load
const loadSchema = z.object({
  antennaId: z.string().min(1, 'Must select an antenna'),
  node1: z.number().int('Must be integer'),
  node2: z.number().int('Must be integer'),
  value: z.number().positive('Load value must be positive'),
}).refine(
  (data) => data.node1 !== data.node2,
  {
    message: 'Node 1 and Node 2 must be different',
    path: ['node2'],
  }
);

type LoadFormData = z.infer<typeof loadSchema>;

interface LoadDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (load: LoadFormData) => Promise<void>;
  loading?: boolean;
  maxNodeIndex?: number;
  elements: AntennaElement[];
}

export const LoadDialog: React.FC<LoadDialogProps> = ({
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
    watch,
    formState: { errors },
  } = useForm<LoadFormData>({
    resolver: zodResolver(loadSchema),
    defaultValues: {
      antennaId: elements[0]?.id || '',
      node1: 0,
      node2: 1,
      value: 50,
    },
  });

  const selectedAntennaId = watch('antennaId');
  const selectedAntenna = elements.find(el => el.id === selectedAntennaId);

  const handleClose = () => {
    if (!adding && !loading) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: LoadFormData) => {
    setAdding(true);
    try {
      await onAdd(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to add load:', error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Add Load</Typography>
        <Typography variant="caption" color="text.secondary">
          Add impedance load to antenna
        </Typography>
      </DialogTitle>

      <form id="load-form" onSubmit={handleSubmit(onSubmit)}>
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

            {/* Load Value */}
            <Grid item xs={12}>
              <Controller
                name="value"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Load Impedance (Ω)"
                    type="number"
                    fullWidth
                    error={!!errors.value}
                    helperText={errors.value?.message || 'Typical values: 50, 75, 100 Ω'}
                    inputProps={{ step: 1, min: 0.1 }}
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
                <strong>Load:</strong> Impedance connected between two nodes for matching or termination
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
            form="load-form"
            variant="contained"
            disabled={adding || loading || maxNodeIndex === 0 || elements.length === 0}
            startIcon={adding || loading ? <CircularProgress size={20} /> : null}
          >
            {adding || loading ? 'Adding...' : 'Add Load'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
