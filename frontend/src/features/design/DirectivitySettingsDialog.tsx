import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from '@mui/material';

export interface DirectivitySettings {
  theta_points: number;
  phi_points: number;
}

interface DirectivitySettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (settings: DirectivitySettings) => void;
  initialSettings?: DirectivitySettings;
}

const DirectivitySettingsDialog: React.FC<DirectivitySettingsDialogProps> = ({
  open,
  onClose,
  onConfirm,
  initialSettings = { theta_points: 19, phi_points: 37 },
}) => {
  const [thetaPoints, setThetaPoints] = useState(initialSettings.theta_points);
  const [phiPoints, setPhiPoints] = useState(initialSettings.phi_points);
  const [errors, setErrors] = useState<{ theta?: string; phi?: string }>({});

  const handleThetaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setThetaPoints(value);

    if (value < 5 || value > 180) {
      setErrors((prev) => ({ ...prev, theta: 'Must be between 5 and 180' }));
    } else {
      setErrors((prev) => ({ ...prev, theta: undefined }));
    }
  };

  const handlePhiChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setPhiPoints(value);

    if (value < 5 || value > 360) {
      setErrors((prev) => ({ ...prev, phi: 'Must be between 5 and 360' }));
    } else {
      setErrors((prev) => ({ ...prev, phi: undefined }));
    }
  };

  const handleConfirm = () => {
    if (!errors.theta && !errors.phi && thetaPoints >= 5 && phiPoints >= 5) {
      onConfirm({ theta_points: thetaPoints, phi_points: phiPoints });
    }
  };

  const handleClose = () => {
    // Reset to initial values
    setThetaPoints(initialSettings.theta_points);
    setPhiPoints(initialSettings.phi_points);
    setErrors({});
    onClose();
  };

  const isValid = !errors.theta && !errors.phi && thetaPoints >= 5 && phiPoints >= 5;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Directivity Pattern Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the angular discretization for far-field radiation pattern computation.
          </Typography>

          <Box>
            <TextField
              fullWidth
              label="Theta Points (Elevation)"
              type="number"
              value={thetaPoints}
              onChange={handleThetaChange}
              error={!!errors.theta}
              helperText={errors.theta || 'Number of points from 0° to 180° (default: 19)'}
              inputProps={{ min: 5, max: 180, step: 1 }}
            />
          </Box>

          <Box>
            <TextField
              fullWidth
              label="Phi Points (Azimuth)"
              type="number"
              value={phiPoints}
              onChange={handlePhiChange}
              error={!!errors.phi}
              helperText={errors.phi || 'Number of points from 0° to 360° (default: 37)'}
              inputProps={{ min: 5, max: 360, step: 1 }}
            />
          </Box>

          <Box sx={{ bgcolor: 'info.lighter', p: 2, borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Total sample points:</strong> {thetaPoints * phiPoints}
              <br />
              <strong>Note:</strong> Higher values provide smoother patterns but increase computation time.
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!isValid}>
          Add Directivity
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DirectivitySettingsDialog;
