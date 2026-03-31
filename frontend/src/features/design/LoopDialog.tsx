import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ExpressionField from '@/components/ExpressionField';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import {
  parseNumericOrExpression,
  BUILTIN_CONSTANTS,
} from '@/utils/expressionEvaluator';

// Validation schema — circular loop only
const loopSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  radius: z.string().min(1, 'Required'),
  wireRadius: z.string().min(1, 'Required'),
  feedGap: z.string().min(1, 'Required'),
  segments: z.string().min(1, 'Required'),
  sourceType: z.enum(['voltage', 'current']),
  sourceAmplitude: z.string().min(1, 'Required'),
  sourcePhase: z.string().min(1, 'Required'),
  position: z.object({
    x: z.string().min(1, 'Required'),
    y: z.string().min(1, 'Required'),
    z: z.string().min(1, 'Required'),
  }),
  orientation: z.object({
    rotX: z.string().min(1, 'Required'),
    rotY: z.string().min(1, 'Required'),
    rotZ: z.string().min(1, 'Required'),
  }),
});

type LoopFormData = z.infer<typeof loopSchema>;

interface ResolvedLoopData {
  name: string;
  radius: number;
  wireRadius: number;
  feedGap: number;
  segments: number;
  sourceType: 'voltage' | 'current';
  sourceAmplitude: number;
  sourcePhase: number;
  position: { x: number; y: number; z: number };
  orientation: { rotX: number; rotY: number; rotZ: number };
  expressions?: Record<string, string>;
}

interface LoopDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: ResolvedLoopData) => Promise<void>;
}

export const LoopDialog: React.FC<LoopDialogProps> = ({ open, onClose, onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const variableContext = useAppSelector(selectVariableContextNumeric);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<LoopFormData>({
    resolver: zodResolver(loopSchema),
    defaultValues: {
      name: 'Loop',
      radius: 'wavelength / (2 * pi)',
      wireRadius: '0.001',
      feedGap: '0.001',
      segments: '32',
      sourceType: 'voltage' as const,
      sourceAmplitude: '1',
      sourcePhase: '0',
      position: {
        x: '0',
        y: '0',
        z: '0',
      },
      orientation: {
        rotX: '0',
        rotY: '0',
        rotZ: '0',
      },
    },
  });

  const sourceType = watch('sourceType');

  const handleClose = () => {
    if (!isGenerating) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: LoopFormData) => {
    setIsGenerating(true);
    try {
      const ctx = { ...BUILTIN_CONSTANTS, ...variableContext };
      const resolved: ResolvedLoopData = {
        ...data,
        radius: parseNumericOrExpression(data.radius, ctx),
        wireRadius: parseNumericOrExpression(data.wireRadius, ctx),
        feedGap: parseNumericOrExpression(data.feedGap, ctx),
        segments: Math.round(parseNumericOrExpression(data.segments, ctx)),
        sourceAmplitude: parseNumericOrExpression(data.sourceAmplitude, ctx),
        sourcePhase: parseNumericOrExpression(data.sourcePhase, ctx),
        position: {
          x: parseNumericOrExpression(data.position.x, ctx),
          y: parseNumericOrExpression(data.position.y, ctx),
          z: parseNumericOrExpression(data.position.z, ctx),
        },
        orientation: {
          rotX: parseNumericOrExpression(data.orientation.rotX, ctx),
          rotY: parseNumericOrExpression(data.orientation.rotY, ctx),
          rotZ: parseNumericOrExpression(data.orientation.rotZ, ctx),
        },
        expressions: {
          radius: data.radius,
          wireRadius: data.wireRadius,
          feedGap: data.feedGap,
          segments: data.segments,
          sourceAmplitude: data.sourceAmplitude,
          sourcePhase: data.sourcePhase,
          positionX: data.position.x,
          positionY: data.position.y,
          positionZ: data.position.z,
          orientationRotX: data.orientation.rotX,
          orientationRotY: data.orientation.rotY,
          orientationRotZ: data.orientation.rotZ,
        },
      };
      await onGenerate(resolved);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate loop:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Configure Loop Antenna</Typography>
        <Typography variant="caption" color="text.secondary">
          Design a circular loop antenna
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Name */}
            <Grid item xs={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Antenna Name"
                    fullWidth
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* Loop Radius */}
            <Grid item xs={12}>
              <Controller
                name="radius"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Loop Radius"
                    fullWidth
                    unit="m"
                    validate={(v) => (v > 0 ? null : 'Radius must be positive')}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Wire Radius */}
            <Grid item xs={6}>
              <Controller
                name="wireRadius"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Wire Radius"
                    fullWidth
                    unit="m"
                    validate={(v) => (v > 0 ? null : 'Wire radius must be positive')}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Feed Gap */}
            <Grid item xs={6}>
              <Controller
                name="feedGap"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Feed Gap"
                    fullWidth
                    unit="m"
                    validate={(v) => (v >= 0 ? null : 'Feed gap must be non-negative')}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Segments */}
            <Grid item xs={6}>
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
                      Number.isInteger(v) && v >= 8 && v <= 1000
                        ? null
                        : 'Must be integer 8-1000'
                    }
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Feed Configuration */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Feed Configuration
                </Typography>
              </Divider>
            </Grid>

            {/* Source Type Toggle */}
            <Grid item xs={12}>
              <Controller
                name="sourceType"
                control={control}
                render={({ field }) => (
                  <ToggleButtonGroup
                    value={field.value}
                    exclusive
                    onChange={(_, value) => {
                      if (value !== null) field.onChange(value);
                    }}
                    size="small"
                    disabled={isGenerating}
                    fullWidth
                  >
                    <ToggleButton value="voltage">Voltage</ToggleButton>
                    <ToggleButton value="current">Current</ToggleButton>
                  </ToggleButtonGroup>
                )}
              />
            </Grid>

            {/* Amplitude */}
            <Grid item xs={6}>
              <Controller
                name="sourceAmplitude"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Amplitude"
                    fullWidth
                    unit={sourceType === 'voltage' ? 'V' : 'A'}
                    validate={(v) => (v >= 0 ? null : 'Must be non-negative')}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Phase */}
            <Grid item xs={6}>
              <Controller
                name="sourcePhase"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Phase"
                    fullWidth
                    unit="°"
                    validate={(v) =>
                      Math.abs(v) <= 360 ? null : 'Must be -360 to 360'
                    }
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Position and Orientation Controls */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Position & Orientation
                </Typography>
              </Divider>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Position (meters)
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="position.x"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="X"
                    fullWidth
                    unit="m"
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="position.y"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Y"
                    fullWidth
                    unit="m"
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="position.z"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Z"
                    fullWidth
                    unit="m"
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                Orientation (rotation angles)
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.rotX"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Rot X"
                    fullWidth
                    unit="°"
                    validate={(v) =>
                      Math.abs(v) <= 180 ? null : 'Must be -180 to 180'
                    }
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.rotY"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Rot Y"
                    fullWidth
                    unit="°"
                    validate={(v) =>
                      Math.abs(v) <= 180 ? null : 'Must be -180 to 180'
                    }
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.rotZ"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Rot Z"
                    fullWidth
                    unit="°"
                    validate={(v) =>
                      Math.abs(v) <= 180 ? null : 'Must be -180 to 180'
                    }
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Design Guidelines */}
            <Grid item xs={12}>
              <Alert severity="info">
                <Typography variant="caption" component="div">
                  <strong>Loop Antenna Guidelines:</strong>
                </Typography>
                <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                  • Small loops (C ≪ λ): Low radiation resistance, used as magnetic sensors
                </Typography>
                <Typography variant="caption" component="div">
                  • Resonant loops (C ≈ λ): Higher efficiency, omnidirectional pattern
                </Typography>
                <Typography variant="caption" component="div">
                  • Wire radius affects bandwidth and impedance
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isGenerating}
            startIcon={isGenerating ? <CircularProgress size={20} /> : null}
          >
            {isGenerating ? 'Generating...' : 'Generate Loop'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
