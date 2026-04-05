import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  Divider,
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
import { WirePreview3D } from '@/components/WirePreview3D';
import { useDipolePreview } from '@/hooks/useAntennaPreview';

// Validation schema — expression-capable fields store strings
const dipoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  length: z.string().min(1, 'Required'),
  radius: z.string().min(1, 'Required'),
  gap: z.string().min(1, 'Required'),
  segments: z.string().min(1, 'Required'),
  feedType: z.enum(['gap', 'balanced']),
  sourceType: z.enum(['voltage', 'current']),
  sourceAmplitude: z.string().min(1, 'Required'),
  sourcePhase: z.string().min(1, 'Required'),
  position: z.object({
    x: z.string().min(1, 'Required'),
    y: z.string().min(1, 'Required'),
    z: z.string().min(1, 'Required'),
  }),
  orientation: z.object({
    x: z.string().min(1, 'Required'),
    y: z.string().min(1, 'Required'),
    z: z.string().min(1, 'Required'),
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
  expressions?: Record<string, string>;
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
      segments: '21',
      feedType: 'gap',
      sourceType: 'voltage' as const,
      sourceAmplitude: '1',
      sourcePhase: '0',
      position: {
        x: '0',
        y: '0',
        z: '0',
      },
      orientation: {
        x: '0',
        y: '0',
        z: '1',
      },
    },
  });

  // Watch orientation values to determine which preset is active
  const orientationX = watch('orientation.x');
  const orientationY = watch('orientation.y');
  const orientationZ = watch('orientation.z');

  // Watch source type for dynamic unit label
  const sourceType = watch('sourceType');

  // Watch all geometry fields for live 3D preview
  const previewGeometry = useDipolePreview({
    length: watch('length'),
    radius: watch('radius'),
    gap: watch('gap'),
    segments: watch('segments'),
    position: {
      x: watch('position.x'),
      y: watch('position.y'),
      z: watch('position.z'),
    },
    orientation: {
      x: orientationX,
      y: orientationY,
      z: orientationZ,
    },
  });

  // Determine active preset based on current values
  const getActivePreset = (): 'X' | 'Y' | 'Z' | 'Custom' => {
    if (orientationX === '1' && orientationY === '0' && orientationZ === '0') return 'X';
    if (orientationX === '0' && orientationY === '1' && orientationZ === '0') return 'Y';
    if (orientationX === '0' && orientationY === '0' && orientationZ === '1') return 'Z';
    return 'Custom';
  };

  const handlePresetChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (value === 'X') {
      setValue('orientation.x', '1', { shouldValidate: true });
      setValue('orientation.y', '0', { shouldValidate: true });
      setValue('orientation.z', '0', { shouldValidate: true });
    } else if (value === 'Y') {
      setValue('orientation.x', '0', { shouldValidate: true });
      setValue('orientation.y', '1', { shouldValidate: true });
      setValue('orientation.z', '0', { shouldValidate: true });
    } else if (value === 'Z') {
      setValue('orientation.x', '0', { shouldValidate: true });
      setValue('orientation.y', '0', { shouldValidate: true });
      setValue('orientation.z', '1', { shouldValidate: true });
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
        segments: Math.round(parseNumericOrExpression(data.segments, ctx)),
        sourceAmplitude: parseNumericOrExpression(data.sourceAmplitude, ctx),
        sourcePhase: parseNumericOrExpression(data.sourcePhase, ctx),
        position: {
          x: parseNumericOrExpression(data.position.x, ctx),
          y: parseNumericOrExpression(data.position.y, ctx),
          z: parseNumericOrExpression(data.position.z, ctx),
        },
        orientation: {
          x: parseNumericOrExpression(data.orientation.x, ctx),
          y: parseNumericOrExpression(data.orientation.y, ctx),
          z: parseNumericOrExpression(data.orientation.z, ctx),
        },
        expressions: {
          length: data.length,
          radius: data.radius,
          gap: data.gap,
          segments: data.segments,
          sourceAmplitude: data.sourceAmplitude,
          sourcePhase: data.sourcePhase,
          positionX: data.position.x,
          positionY: data.position.y,
          positionZ: data.position.z,
          orientationX: data.orientation.x,
          orientationY: data.orientation.y,
          orientationZ: data.orientation.z,
        },
      };
      // Validate orientation non-zero AFTER resolving
      const ox = resolved.orientation.x, oy = resolved.orientation.y, oz = resolved.orientation.z;
      if (ox === 0 && oy === 0 && oz === 0) {
        throw new Error('Orientation vector cannot be zero');
      }
      await onGenerate(resolved);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate dipole:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Compute source node IDs for port markers (nodes adjacent to the feed gap)
  const sourceNodeIds = useMemo(() => {
    if (previewGeometry.nodes.length < 2) return new Set<number>();
    // For a dipole, the source is at the gap: last node of lower arm and first node of upper arm
    const segCount = Math.max(Math.round(parseFloat(watch('segments')) || 21), 2);
    const armSegments = Math.max(Math.floor(segCount / 2), 1);
    const lowerEnd = armSegments + 1;    // last node of lower arm
    const upperStart = armSegments + 2;   // first node of upper arm
    return new Set<number>([lowerEnd, upperStart]);
  }, [previewGeometry.nodes.length, watch]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Dipole Antenna Configuration
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Design a center-fed dipole antenna
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* Left side: form fields */}
            <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
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
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Segments"
                    fullWidth
                    validate={(v) =>
                      Number.isInteger(v) && v >= 5 && v <= 1000
                        ? null
                        : 'Must be integer 5-1000'
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
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="X"
                    fullWidth
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.y"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Y"
                    fullWidth
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            <Grid item xs={4}>
              <Controller
                name="orientation.z"
                control={control}
                render={({ field }) => (
                  <ExpressionField
                    value={field.value}
                    onChange={field.onChange}
                    label="Z"
                    fullWidth
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>


          </Grid>
            </Box>

            {/* Right side: 3D preview */}
            <Box sx={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>
                3D Preview
              </Typography>
              {previewGeometry.nodes.length >= 2 ? (
                <WirePreview3D
                  nodes={previewGeometry.nodes}
                  edges={previewGeometry.edges}
                  sourceNodes={sourceNodeIds}
                  showLabels
                  height="100%"
                  width="100%"
                />
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1a1a2e', borderRadius: 1, color: '#666', minHeight: 300 }}>
                  Adjust parameters to see preview
                </Box>
              )}
            </Box>
          </Box>
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
