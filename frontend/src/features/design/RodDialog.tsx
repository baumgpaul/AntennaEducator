import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ExpressionField from '@/components/ExpressionField';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import { parseNumericOrExpression, BUILTIN_CONSTANTS } from '@/utils/expressionEvaluator';

// Zod validation schema
const rodSchema = z.object({
  start_x: z.string().min(1, 'Required'),
  start_y: z.string().min(1, 'Required'),
  start_z: z.string().min(1, 'Required'),
  end_x: z.string().min(1, 'Required'),
  end_y: z.string().min(1, 'Required'),
  end_z: z.string().min(1, 'Required'),
  radius: z.string().min(1, 'Required'),
  segments: z.string().min(1, 'Required'),
});

type RodFormData = z.infer<typeof rodSchema>;

interface ResolvedRodData {
  start_x: number;
  start_y: number;
  start_z: number;
  end_x: number;
  end_y: number;
  end_z: number;
  radius: number;
  segments: number;
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
      start_x: '0',
      start_y: '0',
      start_z: '0',
      end_x: '0',
      end_y: '0',
      end_z: '1',
      radius: '0.001',
      segments: '20',
    },
  });

  const startX = watch('start_x');
  const startY = watch('start_y');
  const startZ = watch('start_z');
  const endX = watch('end_x');
  const endY = watch('end_y');
  const endZ = watch('end_z');

  // Calculate rod length from expression values
  const ctx = { ...BUILTIN_CONSTANTS, ...variableContext };
  let rodLength = 0;
  try {
    const sx = parseNumericOrExpression(startX, ctx);
    const sy = parseNumericOrExpression(startY, ctx);
    const sz = parseNumericOrExpression(startZ, ctx);
    const ex = parseNumericOrExpression(endX, ctx);
    const ey = parseNumericOrExpression(endY, ctx);
    const ez = parseNumericOrExpression(endZ, ctx);
    rodLength = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2 + (ez - sz) ** 2);
  } catch {
    /* keep 0 */
  }

  const handleFormSubmit = async (data: RodFormData) => {
    setGenerating(true);
    try {
      const submitCtx = { ...BUILTIN_CONSTANTS, ...variableContext };
      const resolved: ResolvedRodData = {
        start_x: parseNumericOrExpression(data.start_x, submitCtx),
        start_y: parseNumericOrExpression(data.start_y, submitCtx),
        start_z: parseNumericOrExpression(data.start_z, submitCtx),
        end_x: parseNumericOrExpression(data.end_x, submitCtx),
        end_y: parseNumericOrExpression(data.end_y, submitCtx),
        end_z: parseNumericOrExpression(data.end_z, submitCtx),
        radius: parseNumericOrExpression(data.radius, submitCtx),
        segments: Math.round(parseNumericOrExpression(data.segments, submitCtx)),
        expressions: {
          start_x: data.start_x,
          start_y: data.start_y,
          start_z: data.start_z,
          end_x: data.end_x,
          end_y: data.end_y,
          end_z: data.end_z,
          radius: data.radius,
          segments: data.segments,
        },
      };
      // Validate start != end AFTER resolving
      const dx = resolved.end_x - resolved.start_x;
      const dy = resolved.end_y - resolved.start_y;
      const dz = resolved.end_z - resolved.start_z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6) {
        throw new Error('Start and end points must be different');
      }
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
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="X"
                    fullWidth
                    unit="m"
                    disabled={generating}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="start_y"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Y"
                    fullWidth
                    unit="m"
                    disabled={generating}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="start_z"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Z"
                    fullWidth
                    unit="m"
                    disabled={generating}
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
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="X"
                    fullWidth
                    unit="m"
                    disabled={generating}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="end_y"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Y"
                    fullWidth
                    unit="m"
                    disabled={generating}
                  />
                )}
              />
            </Grid>
            <Grid item xs={4}>
              <Controller
                name="end_z"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Z"
                    fullWidth
                    unit="m"
                    disabled={generating}
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
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Number of Segments"
                    fullWidth
                    validate={(v) =>
                      Number.isInteger(v) && v >= 1 && v <= 200
                        ? null
                        : 'Must be integer 1-200'
                    }
                    disabled={generating}
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
