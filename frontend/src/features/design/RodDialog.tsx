import React, { useState } from 'react';
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
  Typography,
  Divider,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ExpressionField from '@/components/ExpressionField';
import { PositionControl } from '@/components/PositionControl';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import { parseNumericOrExpression, BUILTIN_CONSTANTS } from '@/utils/expressionEvaluator';
import { parseDecimalNumber } from '@/utils/numberParser';
// Zod validation schema
const rodSchema = z.object({
  start_x: z.number().min(-10, 'X too small').max(10, 'X too large'),
  start_y: z.number().min(-10, 'Y too small').max(10, 'Y too large'),
  start_z: z.number().min(-10, 'Z too small').max(10, 'Z too large'),
  end_x: z.number().min(-10, 'X too small').max(10, 'X too large'),
  end_y: z.number().min(-10, 'Y too small').max(10, 'Y too large'),
  end_z: z.number().min(-10, 'Z too small').max(10, 'Z too large'),
  radius: z.string().min(1, 'Required'),
  segments: z.number().int().min(1, 'At least 1 segment required').max(200, 'Max 200 segments'),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  orientation: z.object({
    rotX: z.number().min(-180).max(180),
    rotY: z.number().min(-180).max(180),
    rotZ: z.number().min(-180).max(180),
  }),
}).refine(
  (data) => {
    // Check that start and end points are different
    const dx = data.end_x - data.start_x;
    const dy = data.end_y - data.start_y;
    const dz = data.end_z - data.start_z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return length > 1e-6;
  },
  {
    message: 'Start and end points must be different',
    path: ['end_x'],
  }
);

type RodFormData = z.infer<typeof rodSchema>;

interface ResolvedRodData extends Omit<RodFormData, 'radius'> {
  radius: number;
  expressions?: Record<string, string>;
}

interface RodDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: ResolvedRodData) => Promise<void>;
  loading?: boolean;
}

export const RodDialog: React.FC<RodDialogProps> = ({ open, onClose, onGenerate, loading = false }) => {
  const [generating, setGenerating] = useState(false);
  const variableContext = useAppSelector(selectVariableContextNumeric);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<RodFormData>({
    resolver: zodResolver(rodSchema),
    defaultValues: {
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 0,
      end_z: 1.0,
      radius: '0.001',
      segments: 20,
      position: {
        x: 0,
        y: 0,
        z: 0,
      },
      orientation: {
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      },
    },
  });

  const startX = watch('start_x');
  const startY = watch('start_y');
  const startZ = watch('start_z');
  const endX = watch('end_x');
  const endY = watch('end_y');
  const endZ = watch('end_z');

  // Calculate rod length
  const dx = endX - startX;
  const dy = endY - startY;
  const dz = endZ - startZ;
  const rodLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const handleFormSubmit = async (data: RodFormData) => {
    setGenerating(true);
    try {
      const ctx = { ...BUILTIN_CONSTANTS, ...variableContext };
      const resolved: ResolvedRodData = {
        ...data,
        radius: parseNumericOrExpression(data.radius, ctx),
        expressions: {
          radius: data.radius,
        },
      };
      await onGenerate(resolved);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate rod:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    if (!generating && !loading) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Metallic Rod</DialogTitle>
      <DialogContent>
        <form id="rod-form" onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Start Point */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Start Point (m)
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="start_x"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="X"
                    type="number"
                    fullWidth
                    error={!!errors.start_x}
                    helperText={errors.start_x?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="start_y"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Y"
                    type="number"
                    fullWidth
                    error={!!errors.start_y}
                    helperText={errors.start_y?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="start_z"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Z"
                    type="number"
                    fullWidth
                    error={!!errors.start_z}
                    helperText={errors.start_z?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* End Point */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                End Point (m)
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="end_x"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="X"
                    type="number"
                    fullWidth
                    error={!!errors.end_x}
                    helperText={errors.end_x?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="end_y"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Y"
                    type="number"
                    fullWidth
                    error={!!errors.end_y}
                    helperText={errors.end_y?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="end_z"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Z"
                    type="number"
                    fullWidth
                    error={!!errors.end_z}
                    helperText={errors.end_z?.message}
                    inputProps={{ step: 0.01 }}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Wire Radius */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="radius"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Wire Radius"
                    fullWidth
                    unit="m"
                    validate={(v) => (v > 0 ? null : 'Radius must be positive')}
                    disabled={generating}
                  />
                )}
              />
            </Grid>

            {/* Segments */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="segments"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Number of Segments"
                    type="number"
                    fullWidth
                    error={!!errors.segments}
                    helperText={errors.segments?.message || 'More = better accuracy'}
                    inputProps={{ step: 1 }}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Rod Length Display */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Calculated Length:</strong> {rodLength.toFixed(4)} m ({(rodLength * 100).toFixed(2)} cm)
              </Alert>
            </Grid>

            {/* Position and Orientation Controls */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <PositionControl
                control={control}
                positionPrefix="position"
                orientationPrefix="orientation"
                title="Global Position & Orientation"
                subtitle="Additional offset and rotation applied to the rod after local coordinates"
                showPresets={false}
              />
            </Grid>

            {/* Usage Info */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Common Uses:</strong>
                <br />
                • Ground plane radials
                <br />
                • Reflector elements
                <br />
                • Director elements (Yagi arrays)
                <br />
                • Parasitic elements
                <br />
                • Custom wire structures
              </Alert>
            </Grid>
          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={generating || loading}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="rod-form"
          variant="contained"
          disabled={generating || loading}
          startIcon={generating || loading ? <CircularProgress size={20} /> : null}
        >
          {generating || loading ? 'Generating...' : 'Generate Rod'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
