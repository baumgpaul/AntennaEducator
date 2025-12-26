import {
  Grid,
  TextField,
  Typography,
  InputAdornment,
  Box,
  ButtonGroup,
  Button,
  Tooltip,
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

export type PositionPreset = 'center' | 'ground-plane' | 'above-ground';

interface PositionControlProps {
  control: Control<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  positionPrefix?: string;
  orientationPrefix?: string;
  showOrientation?: boolean;
  title?: string;
  subtitle?: string;
  showPresets?: boolean;
  antennaHeight?: number;
}

export function PositionControl({
  control,
  positionPrefix = 'position',
  orientationPrefix = 'orientation',
  showOrientation = true,
  title = 'Position & Orientation',
  subtitle = 'Set element placement in 3D space',
  showPresets = true,
  antennaHeight = 0.5,
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
                value={field.value ?? 0}
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
                value={field.value ?? 0}
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
                value={field.value ?? 0}
              />
            )}
          />
        </Grid>

        {/* Position Presets */}
        {showPresets && (
          <Grid item xs={12}>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
              Quick Presets:
            </Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Position at origin [0, 0, 0]">
                <Button
                  onClick={() => {
                    // Use getValues and setValue from form context
                    const form = control as any;
                    if (form._formValues) {
                      form._formValues[positionPrefix] = { x: 0, y: 0, z: 0 };
                    }
                  }}
                >
                  Center
                </Button>
              </Tooltip>
              <Tooltip title="Position on ground plane [0, 0, 0.01m]">
                <Button
                  onClick={() => {
                    const form = control as any;
                    if (form._formValues) {
                      form._formValues[positionPrefix] = { x: 0, y: 0, z: 0.01 };
                    }
                  }}
                >
                  Ground
                </Button>
              </Tooltip>
              <Tooltip title={`Position above ground [0, 0, ${(antennaHeight / 2).toFixed(2)}m]`}>
                <Button
                  onClick={() => {
                    const form = control as any;
                    if (form._formValues) {
                      form._formValues[positionPrefix] = { x: 0, y: 0, z: antennaHeight / 2 };
                    }
                  }}
                >
                  Above
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Grid>
        )}

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
                    label="X Rotation"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    value={field.value ?? 0}
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
                    label="Y Rotation"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    value={field.value ?? 0}
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
                    label="Z Rotation"
                    type="number"
                    inputProps={{ step: 1, min: -180, max: 180 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">°</InputAdornment>,
                    }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    value={field.value ?? 0}
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