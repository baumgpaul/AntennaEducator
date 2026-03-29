import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import { z } from 'zod';

/**
 * Frequency validation schema
 * Converts between MHz and GHz and validates range
 */
const frequencySchema = z.object({
  value: z.number().positive('Frequency must be positive'),
  unit: z.enum(['MHz', 'GHz']),
}).refine((data) => {
  // Convert to MHz for validation
  const frequencyInMHz = data.unit === 'GHz' ? data.value * 1000 : data.value;
  return frequencyInMHz >= 0.1 && frequencyInMHz <= 10000; // 0.1 MHz to 10 GHz
}, {
  message: 'Frequency must be between 0.1 MHz and 10 GHz',
});

interface FrequencyInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSolve: (frequency: number, unit: 'MHz' | 'GHz') => Promise<void>;
  isLoading?: boolean;
  initialFrequency?: number; // MHz
}

/**
 * FrequencyInputDialog - Single frequency solver input
 *
 * Features:
 * - MHz/GHz unit selector
 * - Frequency range validation (0.1 MHz - 1000 GHz)
 * - Loading state during solve
 * - Error handling and display
 *
 * Usage:
 * ```tsx
 * <FrequencyInputDialog
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   onSolve={async (freq) => await solveSingleFrequency(freq)}
 * />
 * ```
 */
export function FrequencyInputDialog({
  open,
  onClose,
  onSolve,
  isLoading = false,
  initialFrequency,
}: FrequencyInputDialogProps) {
  const [frequency, setFrequency] = useState<number>(initialFrequency ?? 300);
  const [unit, setUnit] = useState<'MHz' | 'GHz'>('MHz');
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync frequency when dialog re-opens with a new initial value
  useEffect(() => {
    if (open && initialFrequency !== undefined) {
      setFrequency(initialFrequency);
    }
  }, [open, initialFrequency]);

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setFrequency(value);
    setValidationError(null);
    setError(null);
  };

  const handleUnitChange = (e: any) => {
    const newUnit = e.target.value as 'MHz' | 'GHz';
    setUnit(newUnit);
    setValidationError(null);
  };

  const handleSolve = async () => {
    try {
      // Validate input
      const result = frequencySchema.safeParse({
        value: frequency,
        unit,
      });

      if (!result.success) {
        // Get first error message from Zod validation
        const issues = result.error.issues;
        const errorMessage = issues.length > 0 ? issues[0].message : 'Invalid frequency';
        setValidationError(errorMessage);
        return;
      }

      // Call solve function with frequency and unit
      await onSolve(frequency, unit);

      // Close dialog on success
      onClose();

      // Reset state
      setError(null);
      setValidationError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to solve');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      setValidationError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="frequency-input-dialog-title"
    >
      <DialogTitle id="frequency-input-dialog-title">
        Solve Single Frequency
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={8}>
              <TextField
                autoFocus
                fullWidth
                label="Frequency"
                type="number"
                value={frequency}
                onChange={handleFrequencyChange}
                error={!!validationError}
                helperText={validationError || 'Enter frequency value'}
                disabled={isLoading}
                inputProps={{
                  min: 0.1,
                  step: unit === 'GHz' ? 0.1 : 10,
                }}
              />
            </Grid>
            <Grid item xs={4}>
              <FormControl fullWidth disabled={isLoading}>
                <InputLabel id="frequency-unit-label">Unit</InputLabel>
                <Select
                  labelId="frequency-unit-label"
                  id="frequency-unit-select"
                  value={unit}
                  label="Unit"
                  onChange={handleUnitChange}
                >
                  <MenuItem value="MHz">MHz</MenuItem>
                  <MenuItem value="GHz">GHz</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSolve}
          variant="contained"
          disabled={isLoading || !frequency}
          startIcon={isLoading ? <CircularProgress size={20} /> : null}
        >
          {isLoading ? 'Solving...' : 'Solve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
