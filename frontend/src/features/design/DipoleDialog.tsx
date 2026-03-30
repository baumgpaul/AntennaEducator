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
  Box,
  Typography,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { parseDecimalNumber } from '@/utils/numberParser';
import ExpressionField from '@/components/ExpressionField';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import {
  parseNumericOrExpression,
  BUILTIN_CONSTANTS,
} from '@/utils/expressionEvaluator';

// Validation schema — expression-capable fields store strings
const dipoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  length: z.string().min(1, 'Required'),
  radius: z.string().min(1, 'Required'),
  gap: z.string().min(1, 'Required'),
  segments: z.number().int('Must be integer').min(5, 'Minimum 5 segments').max(1000, 'Maximum 1000 segments'),
  feedType: z.enum(['gap', 'balanced']),
  sourceType: z.enum(['voltage', 'current']),
  sourceAmplitude: z.number().nonnegative('Amplitude must be non-negative'),
  sourcePhase: z.number().min(-360).max(360),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  orientation: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).refine((o) => o.x !== 0 || o.y !== 0 || o.z !== 0, {
    message: 'Orientation vector cannot be zero',
  }),
});

type DipoleFormData = z.infer<typeof dipoleSchema>;

interface ResolvedDipoleData {
  name: string;
  length: number;
  radius: number;
  gap: number;
  segments: number;
  feedType: 'gap' | 'balanced';
  sourceType: 'voltage' | 'current';
  sourceAmplitude: number;
  sourcePhase: number;
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number };
}

interface DipoleDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: ResolvedDipoleData) => Promise<void>;
}

export const DipoleDialog: React.FC<DipoleDialogProps> = ({ open, onClose, onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const variableContext = useAppSelector(selectVariableContextNumeric);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DipoleFormData>({
    resolver: zodResolver(dipoleSchema),
    defaultValues: {
      name: 'Dipole',
      length: 'wavelength / 2',
      radius: '0.001',
      gap: '0.001',
      segments: 21,
      feedType: 'gap',
      sourceType: 'voltage' as const,
      sourceAmplitude: 1,
      sourcePhase: 0,
      position: {
        x: 0,
        y: 0,
        z: 0,
      },
      orientation: {
        x: 0,
        y: 0,
        z: 1,
      },
    },
  });

  // Watch orientation values to determine which preset is active
  const orientationX = watch('orientation.x');
  const orientationY = watch('orientation.y');
  const orientationZ = watch('orientation.z');

  // Watch source type for dynamic unit label
  const sourceType = watch('sourceType');

  // Determine active preset based on current values
  const getActivePreset = (): 'X' | 'Y' | 'Z' | 'Custom' => {
    if (orientationX === 1 && orientationY === 0 && orientationZ === 0) return 'X';
    if (orientationX === 0 && orientationY === 1 && orientationZ === 0) return 'Y';
    if (orientationX === 0 && orientationY === 0 && orientationZ === 1) return 'Z';
    return 'Custom';
  };

  const handlePresetChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (value === 'X') {
      setValue('orientation.x', 1, { shouldValidate: true });
      setValue('orientation.y', 0, { shouldValidate: true });
      setValue('orientation.z', 0, { shouldValidate: true });
    } else if (value === 'Y') {
      setValue('orientation.x', 0, { shouldValidate: true });
      setValue('orientation.y', 1, { shouldValidate: true });
      setValue('orientation.z', 0, { shouldValidate: true });
    } else if (value === 'Z') {
      setValue('orientation.x', 0, { shouldValidate: true });
      setValue('orientation.y', 0, { shouldValidate: true });
      setValue('orientation.z', 1, { shouldValidate: true });
    }
    // Custom preset doesn't change values, just indicates non-axis orientation
  };

  const handleClose = () => {
    if (!isGenerating) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: DipoleFormData) => {
    setIsGenerating(true);
    try {
      const ctx = { ...BUILTIN_CONSTANTS, ...variableContext };
      const resolved: ResolvedDipoleData = {
        ...data,
        length: parseNumericOrExpression(data.length, ctx),
        radius: parseNumericOrExpression(data.radius, ctx),
        gap: parseNumericOrExpression(data.gap, ctx),
      };
      await onGenerate(resolved);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate dipole:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Dipole Antenna Configuration
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Design a center-fed dipole antenna
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
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
              <Divider>
                <Typography variant="caption" color="text.secondary">
                  Geometry Parameters
                </Typography>
              </Divider>
            </Grid>

            {/* Length */}
            <Grid item xs={6}>
              <Controller
                name="length"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Total Length"
                    fullWidth
                    unit="m"
                    validate={(v) => (v > 0 ? null : 'Length must be positive')}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Radius */}
            <Grid item xs={6}>
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
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Gap */}
            <Grid item xs={6}>
              <Controller
                name="gap"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Feed Gap"
                    fullWidth
                    unit="m"
                    validate={(v) => (v >= 0 ? null : 'Gap must be non-negative')}
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
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                    label="Segments"
                    type="number"
                    fullWidth
                    error={!!errors.segments}
                    helperText={errors.segments?.message || 'Number of wire segments'}
                    disabled={isGenerating}
                    inputProps={{ step: 1 }}
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

            {/* Position Controls */}
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
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="X"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    inputProps={{ step: 0.001 }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="position.y"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="Y"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    inputProps={{ step: 0.001 }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="position.z"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="Z"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    inputProps={{ step: 0.001 }}
                  />
                )}
              />
            </Grid>

            {/* Orientation Vector Controls */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                Orientation Vector
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Direction the dipole points along (will be normalized)
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <ToggleButtonGroup
                value={getActivePreset()}
                exclusive
                onChange={handlePresetChange}
                size="small"
                disabled={isGenerating}
                sx={{ mb: 1 }}
              >
                <ToggleButton value="X">X-axis</ToggleButton>
                <ToggleButton value="Y">Y-axis</ToggleButton>
                <ToggleButton value="Z">Z-axis</ToggleButton>
                <ToggleButton value="Custom">Custom</ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.x"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="X"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    inputProps={{ step: 0.1 }}
                    error={!!errors.orientation}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.y"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="Y"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    inputProps={{ step: 0.1 }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.z"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseDecimalNumber(e.target.value) || 0)}
                    label="Z"
                    type="number"
                    fullWidth
                    disabled={isGenerating}
                    inputProps={{ step: 0.1 }}
                  />
                )}
              />
            </Grid>

            {errors.orientation && (
              <Grid item xs={12}>
                <Typography variant="caption" color="error">
                  {errors.orientation.message}
                </Typography>
              </Grid>
            )}

            {/* Design Guidelines */}
            <Grid item xs={12}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'rgba(33, 150, 243, 0.1)',
                  borderRadius: 1,
                  border: '1px solid rgba(33, 150, 243, 0.3)',
                  mt: 1,
                }}
              >
                <Typography variant="caption" display="block" gutterBottom>
                  <strong>Design Guidelines:</strong>
                </Typography>
                <Typography variant="caption" display="block">
                  • Length ≈ λ/2 for resonance (0.48λ - 0.50λ)
                </Typography>
                <Typography variant="caption" display="block">
                  • Radius/Length ratio typically 0.001 - 0.01
                </Typography>
                <Typography variant="caption" display="block">
                  • Use 15-30 segments for accurate results
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Mesh'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
