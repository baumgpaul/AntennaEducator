import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  InputAdornment,
  Box,
} from '@mui/material';
import { Control, Controller, FieldErrors, FieldPath } from 'react-hook-form';

export interface PositionData {
  x: number;
  y: number;
  z: number;
}

export interface OrientationData {
  rotX: number;
  rotY: number;
  rotZ: number;
}

interface PositionControlProps<T extends Record<string, any>> {
  control: Control<T>;
  errors: FieldErrors<T>;
  positionPrefix?: string; // e.g., 'position' for fields like position.x
  orientationPrefix?: string; // e.g., 'orientation' for fields like orientation.rotX
  showOrientation?: boolean;
  title?: string;
  subtitle?: string;
}

export function PositionControl<T extends Record<string, any>>({
  control,
  errors,
  positionPrefix = 'position',
  orientationPrefix = 'orientation',
  showOrientation = true,
  title = 'Position & Orientation',
  subtitle = 'Set element placement in 3D space',
}: PositionControlProps<T>) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {subtitle}
      </Typography>
      
      <Grid container spacing={2}>
        {/* Position Controls */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
            Position (meters)
          </Typography>
        </Grid>
        
        <Grid item xs={4}>
          <Controller
            name={`${positionPrefix}.x` as FieldPath<T>}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="X"
                type="number"
                inputProps={{ step: 0.001 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">m</InputAdornment>,
                }}
                error={Boolean(errors[positionPrefix as keyof T]?.['x' as keyof any])}
                helperText={errors[positionPrefix as keyof T]?.['x' as keyof any]?.message as string}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </Grid>
        
        <Grid item xs={4}>
          <Controller
            name={`${positionPrefix}.y` as FieldPath<T>}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Y"
                type="number"
                inputProps={{ step: 0.001 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">m</InputAdornment>,
                }}
                error={Boolean(errors[positionPrefix as keyof T]?.['y' as keyof any])}
                helperText={errors[positionPrefix as keyof T]?.['y' as keyof any]?.message as string}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </Grid>
        
        <Grid item xs={4}>
          <Controller
            name={`${positionPrefix}.z` as FieldPath<T>}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Z"
                type="number"
                inputProps={{ step: 0.001 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">m</InputAdornment>,
                }}
                error={Boolean(errors[positionPrefix as keyof T]?.['z' as keyof any])}
                helperText={errors[positionPrefix as keyof T]?.['z' as keyof any]?.message as string}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </Grid>

        {/* Orientation Controls */}
        {showOrientation && (
          <>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
                Orientation (degrees)
              </Typography>
            </Grid>
            
            <Grid item xs={4}>
              <Controller
                name={`${orientationPrefix}.rotX` as FieldPath<T>}
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Rotation X"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    error={Boolean(errors[orientationPrefix as keyof T]?.['rotX' as keyof any])}
                    helperText={errors[orientationPrefix as keyof T]?.['rotX' as keyof any]?.message as string}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={4}>
              <Controller
                name={`${orientationPrefix}.rotY` as FieldPath<T>}
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Rotation Y"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    error={Boolean(errors[orientationPrefix as keyof T]?.['rotY' as keyof any])}
                    helperText={errors[orientationPrefix as keyof T]?.['rotY' as keyof any]?.message as string}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={4}>
              <Controller
                name={`${orientationPrefix}.rotZ` as FieldPath<T>}
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Rotation Z"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    error={Boolean(errors[orientationPrefix as keyof T]?.['rotZ' as keyof any])}
                    helperText={errors[orientationPrefix as keyof T]?.['rotZ' as keyof any]?.message as string}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}