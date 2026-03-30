import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  InputAdornment,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Info } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PositionControl } from '@/components/PositionControl';
import { parseDecimalNumber } from '@/utils/numberParser';
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
  segments: z.number().int('Must be integer').min(8, 'Minimum 8 segments').max(1000, 'Maximum 1000 segments'),
  sourceType: z.enum(['voltage', 'current']),
  sourceAmplitude: z.number().nonnegative('Amplitude must be non-negative'),
  sourcePhase: z.number().min(-360).max(360),
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
      segments: 32,
      sourceType: 'voltage' as const,
      sourceAmplitude: 1,
      sourcePhase: 0,
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
        expressions: {
          radius: data.radius,
          wireRadius: data.wireRadius,
          feedGap: data.feedGap,
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
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                    label="Number of Segments"
                    type="number"
                    fullWidth
                    error={!!errors.segments}
                    helperText={errors.segments?.message || 'More segments = better accuracy'}
                    InputProps={{
                      inputProps: { step: 1, min: 8, max: 1000 },
                    }}
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
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value}
                    onChange={(e) => onChange(parseDecimalNumber(e.target.value) ?? 0)}
                    label="Amplitude"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {sourceType === 'voltage' ? 'V' : 'A'}
                        </InputAdornment>
                      ),
                    }}
                    error={!!errors.sourceAmplitude}
                    helperText={errors.sourceAmplitude?.message}
                    disabled={isGenerating}
                    inputProps={{ step: 0.1, min: 0 }}
                  />
                )}
              />
            </Grid>

            {/* Phase */}
            <Grid item xs={6}>
              <Controller
                name="sourcePhase"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value}
                    onChange={(e) => onChange(parseDecimalNumber(e.target.value) ?? 0)}
                    label="Phase"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    error={!!errors.sourcePhase}
                    helperText={errors.sourcePhase?.message}
                    disabled={isGenerating}
                    inputProps={{ step: 1 }}
                  />
                )}
              />
            </Grid>

            {/* Position and Orientation Controls */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <PositionControl
                control={control}
                positionPrefix="position"
                orientationPrefix="orientation"
                title="Position & Orientation"
                subtitle="Set the loop placement and rotation in 3D space"
                showPresets={false}
              />
            </Grid>

            {/* Design Guidelines */}
            <Grid item xs={12}>
              <Alert severity="info" icon={<Info />}>
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
