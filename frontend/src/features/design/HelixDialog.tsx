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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Zod validation schema
const helixSchema = z.object({
  diameter: z.number().positive('Diameter must be positive').max(10, 'Diameter too large'),
  pitch: z.number().positive('Pitch must be positive').max(5, 'Pitch too large'),
  turns: z.number().int().min(1, 'At least 1 turn required').max(50, 'Max 50 turns'),
  helix_mode: z.enum(['axial', 'normal']),
  polarization: z.enum(['RHCP', 'LHCP']),
  wire_radius: z.number().positive('Wire radius must be positive').max(0.1, 'Wire radius too large'),
  frequency: z.number().positive('Frequency must be positive').max(10, 'Frequency too high (max 10 GHz)'),
  segments_per_turn: z.number().int().min(8, 'Min 8 segments per turn').max(50, 'Max 50 segments per turn'),
});

type HelixFormData = z.infer<typeof helixSchema>;

interface HelixDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: HelixFormData) => Promise<void>;
  loading?: boolean;
}

export const HelixDialog: React.FC<HelixDialogProps> = ({ open, onClose, onGenerate, loading = false }) => {
  const [generating, setGenerating] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<HelixFormData>({
    resolver: zodResolver(helixSchema),
    defaultValues: {
      diameter: 0.1,
      pitch: 0.05,
      turns: 5,
      helix_mode: 'axial',
      polarization: 'RHCP',
      wire_radius: 0.001,
      frequency: 1.0,
      segments_per_turn: 16,
    },
  });

  const frequency = watch('frequency');
  const diameter = watch('diameter');
  const turns = watch('turns');

  // Calculate wavelength
  const c = 299792458; // Speed of light m/s
  const wavelength = c / (frequency * 1e9);

  // Calculate helix length
  const pitch = watch('pitch');
  const helixLength = turns * pitch;

  const handleFormSubmit = async (data: HelixFormData) => {
    setGenerating(true);
    try {
      await onGenerate(data);
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to generate helix:', error);
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
      <DialogTitle>Create Helical Antenna</DialogTitle>
      <DialogContent>
        <form id="helix-form" onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Helix Mode */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth error={!!errors.helix_mode}>
                <InputLabel>Helix Mode</InputLabel>
                <Controller
                  name="helix_mode"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label="Helix Mode">
                      <MenuItem value="axial">Axial Mode</MenuItem>
                      <MenuItem value="normal">Normal Mode</MenuItem>
                    </Select>
                  )}
                />
                {errors.helix_mode && (
                  <FormHelperText>{errors.helix_mode.message}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Polarization */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth error={!!errors.polarization}>
                <InputLabel>Polarization</InputLabel>
                <Controller
                  name="polarization"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label="Polarization">
                      <MenuItem value="RHCP">Right-Hand (RHCP)</MenuItem>
                      <MenuItem value="LHCP">Left-Hand (LHCP)</MenuItem>
                    </Select>
                  )}
                />
                {errors.polarization && (
                  <FormHelperText>{errors.polarization.message}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Diameter */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="diameter"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Diameter (m)"
                    type="number"
                    fullWidth
                    error={!!errors.diameter}
                    helperText={errors.diameter?.message}
                    inputProps={{ step: 0.001 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Pitch */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="pitch"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Pitch (m)"
                    type="number"
                    fullWidth
                    error={!!errors.pitch}
                    helperText={errors.pitch?.message || 'Distance between turns'}
                    inputProps={{ step: 0.001 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Number of Turns */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="turns"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Number of Turns"
                    type="number"
                    fullWidth
                    error={!!errors.turns}
                    helperText={errors.turns?.message}
                    inputProps={{ step: 1 }}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Wire Radius */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="wire_radius"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Wire Radius (m)"
                    type="number"
                    fullWidth
                    error={!!errors.wire_radius}
                    helperText={errors.wire_radius?.message}
                    inputProps={{ step: 0.0001 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Frequency */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Frequency (GHz)"
                    type="number"
                    fullWidth
                    error={!!errors.frequency}
                    helperText={errors.frequency?.message}
                    inputProps={{ step: 0.1 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Segments per Turn */}
            <Grid item xs={12} sm={6}>
              <Controller
                name="segments_per_turn"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Segments per Turn"
                    type="number"
                    fullWidth
                    error={!!errors.segments_per_turn}
                    helperText={errors.segments_per_turn?.message || 'More = better accuracy'}
                    inputProps={{ step: 1 }}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
            </Grid>

            {/* Wavelength Display */}
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Calculated Parameters:</strong>
                <br />
                Wavelength λ = {wavelength.toFixed(4)} m ({(wavelength * 100).toFixed(2)} cm)
                <br />
                Helix Length = {helixLength.toFixed(4)} m ({(helixLength * 100).toFixed(2)} cm)
                <br />
                Circumference = {(Math.PI * diameter).toFixed(4)} m
              </Alert>
            </Grid>

            {/* Design Guidelines */}
            <Grid item xs={12}>
              <Alert severity="warning">
                <strong>Design Guidelines:</strong>
                <br />
                • <strong>Axial Mode:</strong> Circumference ≈ λ (circular polarization, max gain)
                <br />
                • <strong>Normal Mode:</strong> Circumference ≪ λ (broadside radiation)
                <br />
                • Pitch angle = arctan(pitch / (π × diameter))
                <br />
                • RHCP: Clockwise when viewed from feed end
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
          form="helix-form"
          variant="contained"
          disabled={generating || loading}
          startIcon={generating || loading ? <CircularProgress size={20} /> : null}
        >
          {generating || loading ? 'Generating...' : 'Generate Helix'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
