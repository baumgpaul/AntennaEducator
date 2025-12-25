import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  InputAdornment,
  FormHelperText,
  Typography,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Info } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PositionControl } from '@/components/PositionControl';

// Common position and orientation schema
const positionOrientationSchema = {
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
};

// Validation schema - conditional based on loop type
const loopSchema = z.discriminatedUnion('loopType', [
  // Circular loop
  z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
    loopType: z.literal('circular'),
    radius: z.number().positive('Radius must be positive').max(10, 'Radius too large'),
    wireRadius: z.number().positive('Wire radius must be positive').max(0.1, 'Wire radius too large'),
    frequency: z.number().positive('Frequency must be positive').max(100e9, 'Frequency too high'),
    segments: z.number().int('Must be integer').min(8, 'Minimum 8 segments').max(1000, 'Maximum 1000 segments'),
    ...positionOrientationSchema,
  }),
  // Rectangular loop
  z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
    loopType: z.literal('rectangular'),
    width: z.number().positive('Width must be positive').max(10, 'Width too large'),
    height: z.number().positive('Height must be positive').max(10, 'Height too large'),
    wireRadius: z.number().positive('Wire radius must be positive').max(0.1, 'Wire radius too large'),
    frequency: z.number().positive('Frequency must be positive').max(100e9, 'Frequency too high'),
    segments: z.number().int('Must be integer').min(8, 'Minimum 8 segments').max(1000, 'Maximum 1000 segments'),
    ...positionOrientationSchema,
  }),
  // Polygon loop - simplified for now
  z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
    loopType: z.literal('polygon'),
    sides: z.number().int('Must be integer').min(3, 'Minimum 3 sides').max(20, 'Maximum 20 sides'),
    circumradius: z.number().positive('Radius must be positive').max(10, 'Radius too large'),
    wireRadius: z.number().positive('Wire radius must be positive').max(0.1, 'Wire radius too large'),
    frequency: z.number().positive('Frequency must be positive').max(100e9, 'Frequency too high'),
    segments: z.number().int('Must be integer').min(8, 'Minimum 8 segments').max(1000, 'Maximum 1000 segments'),
    ...positionOrientationSchema,
  }),
]);

type LoopFormData = z.infer<typeof loopSchema>;

interface LoopDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: LoopFormData) => Promise<void>;
}

export const LoopDialog: React.FC<LoopDialogProps> = ({ open, onClose, onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);

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
      loopType: 'circular',
      radius: 0.048, // ~λ/10 at 1 GHz
      wireRadius: 0.001, // 1mm
      frequency: 1e9, // 1 GHz
      segments: 32,
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

  const loopType = watch('loopType');
  const frequency = watch('frequency');

  // Calculate wavelength for reference
  const wavelength = frequency > 0 ? (3e8 / frequency) : 0;
  const wavelengthMm = wavelength * 1000;

  const handleClose = () => {
    if (!isGenerating) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: LoopFormData) => {
    setIsGenerating(true);
    try {
      await onGenerate(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate loop:', error);
      // Error handling will be done in parent component via notifications
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset shape-specific fields when loop type changes
  useEffect(() => {
    if (loopType === 'circular') {
      reset({
        name: watch('name'),
        loopType: 'circular',
        radius: 0.048,
        wireRadius: watch('wireRadius'),
        frequency: watch('frequency'),
        segments: watch('segments'),
      });
    } else if (loopType === 'rectangular') {
      reset({
        name: watch('name'),
        loopType: 'rectangular',
        width: 0.08,
        height: 0.06,
        wireRadius: watch('wireRadius'),
        frequency: watch('frequency'),
        segments: watch('segments'),
      });
    } else if (loopType === 'polygon') {
      reset({
        name: watch('name'),
        loopType: 'polygon',
        sides: 6,
        circumradius: 0.048,
        wireRadius: watch('wireRadius'),
        frequency: watch('frequency'),
        segments: watch('segments'),
      });
    }
  }, [loopType]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Configure Loop Antenna</Typography>
        <Typography variant="caption" color="text.secondary">
          Design a loop antenna with various shapes
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

            {/* Loop Type Selection */}
            <Grid item xs={12}>
              <Controller
                name="loopType"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.loopType}>
                    <InputLabel>Loop Shape</InputLabel>
                    <Select {...field} label="Loop Shape" disabled={isGenerating}>
                      <MenuItem value="circular">Circular</MenuItem>
                      <MenuItem value="rectangular">Rectangular</MenuItem>
                      <MenuItem value="polygon">Regular Polygon</MenuItem>
                    </Select>
                    {errors.loopType && (
                      <FormHelperText>{errors.loopType.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* Circular loop fields */}
            {loopType === 'circular' && (
              <Grid item xs={12}>
                <Controller
                  name="radius"
                  control={control}
                  render={({ field: { onChange, value, ...field } }) => (
                    <TextField
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                      label="Loop Radius"
                      type="number"
                      fullWidth
                      error={!!(errors as any).radius}
                      helperText={(errors as any).radius?.message || `Typical: λ/10 ≈ ${(wavelength / 10).toFixed(4)} m`}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">m</InputAdornment>,
                        inputProps: { step: 0.001, min: 0 },
                      }}
                      disabled={isGenerating}
                    />
                  )}
                />
              </Grid>
            )}

            {/* Rectangular loop fields */}
            {loopType === 'rectangular' && (
              <>
                <Grid item xs={6}>
                  <Controller
                    name="width"
                    control={control}
                    render={({ field: { onChange, value, ...field } }) => (
                      <TextField
                        {...field}
                        value={value || ''}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        label="Width"
                        type="number"
                        fullWidth
                        error={!!(errors as any).width}
                        helperText={(errors as any).width?.message}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">m</InputAdornment>,
                          inputProps: { step: 0.001, min: 0 },
                        }}
                        disabled={isGenerating}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Controller
                    name="height"
                    control={control}
                    render={({ field: { onChange, value, ...field } }) => (
                      <TextField
                        {...field}
                        value={value || ''}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        label="Height"
                        type="number"
                        fullWidth
                        error={!!(errors as any).height}
                        helperText={(errors as any).height?.message}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">m</InputAdornment>,
                          inputProps: { step: 0.001, min: 0 },
                        }}
                        disabled={isGenerating}
                      />
                    )}
                  />
                </Grid>
              </>
            )}

            {/* Polygon loop fields */}
            {loopType === 'polygon' && (
              <>
                <Grid item xs={6}>
                  <Controller
                    name="sides"
                    control={control}
                    render={({ field: { onChange, value, ...field } }) => (
                      <TextField
                        {...field}
                        value={value || ''}
                        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                        label="Number of Sides"
                        type="number"
                        fullWidth
                        error={!!(errors as any).sides}
                        helperText={(errors as any).sides?.message || 'Polygon sides (3-20)'}
                        InputProps={{
                          inputProps: { step: 1, min: 3, max: 20 },
                        }}
                        disabled={isGenerating}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Controller
                    name="circumradius"
                    control={control}
                    render={({ field: { onChange, value, ...field } }) => (
                      <TextField
                        {...field}
                        value={value || ''}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        label="Circumradius"
                        type="number"
                        fullWidth
                        error={!!(errors as any).circumradius}
                        helperText={(errors as any).circumradius?.message}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">m</InputAdornment>,
                          inputProps: { step: 0.001, min: 0 },
                        }}
                        disabled={isGenerating}
                      />
                    )}
                  />
                </Grid>
              </>
            )}

            {/* Wire Radius */}
            <Grid item xs={6}>
              <Controller
                name="wireRadius"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    label="Wire Radius"
                    type="number"
                    fullWidth
                    error={!!errors.wireRadius}
                    helperText={errors.wireRadius?.message}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                      inputProps: { step: 0.0001, min: 0 },
                    }}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Frequency */}
            <Grid item xs={6}>
              <Controller
                name="frequency"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    label="Frequency"
                    type="number"
                    fullWidth
                    error={!!errors.frequency}
                    helperText={errors.frequency?.message || `λ = ${wavelengthMm.toFixed(1)} mm`}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">Hz</InputAdornment>,
                      inputProps: { step: 1e6, min: 0 },
                    }}
                    disabled={isGenerating}
                  />
                )}
              />
            </Grid>

            {/* Segments */}
            <Grid item xs={12}>
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
                    helperText={errors.segments?.message || 'More segments = better accuracy, longer solve time'}
                    InputProps={{
                      inputProps: { step: 1, min: 8, max: 1000 },
                    }}
                    disabled={isGenerating}
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
