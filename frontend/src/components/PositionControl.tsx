import {
  Grid,
  TextField,
  Typography,
  InputAdornment,
  Box,
  Divider,
} from '@mui/material';
import { Control, Controller } from 'react-hook-form';

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

interface PositionControlProps {
  control: Control<any>;
  positionPrefix?: string;
  orientationPrefix?: string;
  showOrientation?: boolean;
  title?: string;
  subtitle?: string;
}

export function PositionControl({
  control,
  positionPrefix = 'position',
  orientationPrefix = 'orientation',
  showOrientation = true,
  title = 'Position & Orientation',
  subtitle = 'Set element placement in 3D space',
}: PositionControlProps) {
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
            name={`${positionPrefix}.x`}
            control={control}
            defaultValue={0}
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
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </Grid>
        
        <Grid item xs={4}>
          <Controller
            name={`${positionPrefix}.y`}
            control={control}
            defaultValue={0}
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
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </Grid>
        
        <Grid item xs={4}>
          <Controller
            name={`${positionPrefix}.z`}
            control={control}
            defaultValue={0}
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
                name={`${orientationPrefix}.rotX`}
                control={control}
                defaultValue={0}
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
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={4}>
              <Controller
                name={`${orientationPrefix}.rotY`}
                control={control}
                defaultValue={0}
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
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={4}>
              <Controller
                name={`${orientationPrefix}.rotZ`}
                control={control}
                defaultValue={0}
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