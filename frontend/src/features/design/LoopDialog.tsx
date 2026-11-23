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
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useForm, useWatch, Controller } from 'react-hook-form';
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
import { useLoopPreview } from '@/hooks/useAntennaPreview';

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

  const sourceType = useWatch({ control, name: 'sourceType' });

  // Live 3D preview
  const previewGeometry = useLoopPreview({
    radius: useWatch({ control, name: 'radius' }),
    wireRadius: useWatch({ control, name: 'wireRadius' }),
    segments: useWatch({ control, name: 'segments' }),
    position: {
      x: useWatch({ control, name: 'position.x' }),
      y: useWatch({ control, name: 'position.y' }),
      z: useWatch({ control, name: 'position.z' }),
    },
    orientation: {
      rotX: useWatch({ control, name: 'orientation.rotX' }),
      rotY: useWatch({ control, name: 'orientation.rotY' }),
      rotZ: useWatch({ control, name: 'orientation.rotZ' }),
    },
  });

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

  // Compute source node IDs for port markers (nodes at the loop feed gap)
  const sourceNodeIds = useMemo(() => {
    if (previewGeometry.nodes.length < 3) return new Set<number>();
    // Loop has feed gap between node 1 and last node
    const lastId = previewGeometry.nodes[previewGeometry.nodes.length - 1]?.id;
    return new Set<number>([1, lastId].filter((id): id is number => id != null));
  }, [previewGeometry.nodes]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Configure Loop Antenna</Typography>
        <Typography variant="caption" sx={{
          color: "text.secondary"
        }}>
          Design a circular loop antenna
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* Left side: form fields */}
            <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
          <Grid container spacing={3}>
            {/* Name */}
            <Grid size={12}>
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

            <Grid size={12}>
              <Divider />
            </Grid>

            {/* Loop Radius */}
            <Grid size={12}>
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
            <Grid size={6}>
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
            <Grid size={6}>
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
            <Grid size={6}>
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
            <Grid size={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
                  Feed Configuration
                </Typography>
              </Divider>
            </Grid>

            {/* Source Type Toggle */}
            <Grid size={12}>
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
            <Grid size={6}>
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
            <Grid size={6}>
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
            <Grid size={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
                  Position & Orientation
                </Typography>
              </Divider>
            </Grid>

            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom>
                Position (meters)
              </Typography>
            </Grid>

            <Grid size={4}>
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

            <Grid size={4}>
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

            <Grid size={4}>
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

            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                Orientation (rotation angles)
              </Typography>
            </Grid>

            <Grid size={4}>
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

            <Grid size={4}>
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

            <Grid size={4}>
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


          </Grid>
            </Box>

            {/* Right side: 3D preview */}
            <Box sx={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  mb: 1,
                  textAlign: 'center'
                }}>
                3D Preview
              </Typography>
              {previewGeometry.nodes.length >= 3 ? (
                <WirePreview3D
                  nodes={previewGeometry.nodes}
                  edges={previewGeometry.edges}
                  sourceNodes={sourceNodeIds}
                  showLabels={false}
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
