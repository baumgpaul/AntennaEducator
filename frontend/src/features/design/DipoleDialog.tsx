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
  FormHelperText,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Validation schema
const dipoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  length: z.number().positive('Length must be positive').max(100, 'Length too large'),
  radius: z.number().positive('Radius must be positive').max(1, 'Radius too large'),
  gap: z.number().nonnegative('Gap must be non-negative').max(1, 'Gap too large'),
  frequency: z.number().positive('Frequency must be positive').max(100e9, 'Frequency too high'),
  segments: z.number().int('Must be integer').min(5, 'Minimum 5 segments').max(1000, 'Maximum 1000 segments'),
  feedType: z.enum(['gap', 'balanced']),
});

type DipoleFormData = z.infer<typeof dipoleSchema>;

interface DipoleDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: DipoleFormData) => Promise<void>;
}

export const DipoleDialog: React.FC<DipoleDialogProps> = ({ open, onClose, onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DipoleFormData>({
    resolver: zodResolver(dipoleSchema),
    defaultValues: {
      name: 'Dipole',
      length: 0.143, // ~λ/2 at 1 GHz
      radius: 0.001, // 1mm
      gap: 0.001, // 1mm gap
      frequency: 1e9, // 1 GHz
      segments: 21,
      feedType: 'gap',
    },
  });

  const handleClose = () => {
    if (!isGenerating) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: DipoleFormData) => {
    setIsGenerating(true);
    try {
      await onGenerate(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate dipole:', error);
      // Error handling will be done in parent component via notifications
    } finally {
      setIsGenerating(false);
    }
  };

  // Calculate wavelength for reference
  const calculateWavelength = (freq: number) => {
    const c = 299792458; // Speed of light (m/s)
    return c / freq;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Dipole Antenna Configuration</Typography>
        <Typography variant="body2" color="text.secondary">
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
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    label="Total Length"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    error={!!errors.length}
                    helperText={errors.length?.message}
                    disabled={isGenerating}
                    inputProps={{ step: 0.001 }}
                  />
                )}
              />
            </Grid>

            {/* Radius */}
            <Grid item xs={6}>
              <Controller
                name="radius"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    label="Wire Radius"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    error={!!errors.radius}
                    helperText={errors.radius?.message}
                    disabled={isGenerating}
                    inputProps={{ step: 0.0001 }}
                  />
                )}
              />
            </Grid>

            {/* Gap */}
            <Grid item xs={6}>
              <Controller
                name="gap"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    label="Feed Gap"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m</InputAdornment>,
                    }}
                    error={!!errors.gap}
                    helperText={errors.gap?.message || 'Gap between dipole halves'}
                    disabled={isGenerating}
                    inputProps={{ step: 0.0001 }}
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

            <Grid item xs={12}>
              <Divider>
                <Typography variant="caption" color="text.secondary">
                  Operating Frequency
                </Typography>
              </Divider>
            </Grid>

            {/* Frequency */}
            <Grid item xs={12}>
              <Controller
                name="frequency"
                control={control}
                render={({ field: { onChange, value, ...field } }) => (
                  <TextField
                    {...field}
                    value={value / 1e9} // Display in GHz
                    onChange={(e) => onChange((parseFloat(e.target.value) || 0) * 1e9)}
                    label="Design Frequency"
                    type="number"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">GHz</InputAdornment>,
                    }}
                    error={!!errors.frequency}
                    helperText={errors.frequency?.message}
                    disabled={isGenerating}
                    inputProps={{ step: 0.1 }}
                  />
                )}
              />
              <FormHelperText>
                Wavelength: {(calculateWavelength(control._formValues.frequency || 1e9) * 1000).toFixed(2)} mm
              </FormHelperText>
            </Grid>

            {/* Design Guidelines */}
            <Grid item xs={12}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'rgba(33, 150, 243, 0.1)',
                  borderRadius: 1,
                  border: '1px solid rgba(33, 150, 243, 0.3)',
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
