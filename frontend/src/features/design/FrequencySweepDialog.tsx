import React, { useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  Slider,
  Alert,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { FrequencySweepParams, FrequencySpacing } from '../../types'

// ============================================================================
// Validation Schema
// ============================================================================

const frequencySweepSchema = z.object({
  startFrequency: z
    .number()
    .min(0.001e6, 'Start frequency must be at least 1 kHz')
    .max(1000e6, 'Start frequency must be less than 1000 MHz'),
  stopFrequency: z
    .number()
    .min(0.001e6, 'Stop frequency must be at least 1 kHz')
    .max(1000e6, 'Stop frequency must be less than 1000 MHz'),
  numPoints: z
    .number()
    .int()
    .min(2, 'At least 2 frequency points required')
    .max(100, 'Maximum 100 frequency points'),
  spacing: z.enum(['linear', 'logarithmic']),
}).refine((data) => data.stopFrequency > data.startFrequency, {
  message: 'Stop frequency must be greater than start frequency',
  path: ['stopFrequency'],
})

type FrequencySweepFormData = z.infer<typeof frequencySweepSchema>

// ============================================================================
// Component Props
// ============================================================================

interface FrequencySweepDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (params: FrequencySweepParams) => void
  isLoading?: boolean
}

// ============================================================================
// Extracted sub-component for frequency input (hooks must be in a component)
// ============================================================================

interface FrequencyInputFieldProps {
  fieldValue: number;
  onFieldChange: (value: number) => void;
  label: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
}

const FrequencyInputField: React.FC<FrequencyInputFieldProps> = ({
  fieldValue,
  onFieldChange,
  label,
  error,
  helperText,
  disabled,
}) => {
  const [displayValue, setDisplayValue] = React.useState(
    (fieldValue / 1e6).toString()
  );

  // Sync display value when field value changes (e.g., on reset)
  React.useEffect(() => {
    setDisplayValue((fieldValue / 1e6).toString());
  }, [fieldValue]);

  return (
    <TextField
      label={label}
      type="text"
      fullWidth
      error={error}
      helperText={helperText}
      disabled={disabled}
      value={displayValue}
      onChange={(e) => {
        const value = e.target.value.replace(',', '.');
        setDisplayValue(value);
      }}
      onBlur={() => {
        const numValue = parseFloat(displayValue.replace(',', '.'));
        if (!isNaN(numValue) && numValue > 0) {
          onFieldChange(numValue * 1e6);
          setDisplayValue(numValue.toString());
        } else {
          // Reset to current field value if invalid
          setDisplayValue((fieldValue / 1e6).toString());
        }
      }}
      inputProps={{
        inputMode: 'decimal',
        pattern: '[0-9]*[.,]?[0-9]*'
      }}
    />
  );
};

// ============================================================================
// Component
// ============================================================================

export const FrequencySweepDialog: React.FC<FrequencySweepDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FrequencySweepFormData>({
    resolver: zodResolver(frequencySweepSchema),
    defaultValues: {
      startFrequency: 10e6,  // 10 MHz
      stopFrequency: 100e6,  // 100 MHz
      numPoints: 20,
      spacing: 'linear' as FrequencySpacing,
    },
  })

  const startFreq = watch('startFrequency')
  const stopFreq = watch('stopFrequency')
  const numPoints = watch('numPoints')

  // Reset form when dialog opens (not when it closes)
  useEffect(() => {
    if (open) {
      reset()
    }
  }, [open, reset])

  const handleFormSubmit = (data: FrequencySweepFormData) => {
    onSubmit({
      startFrequency: data.startFrequency,
      stopFrequency: data.stopFrequency,
      numPoints: data.numPoints,
      spacing: data.spacing,
    })
  }

  const handleClose = () => {
    if (!isLoading) {
      reset()
      onClose()
    }
  }

  // Helper to format frequency in MHz
  const formatFreqMHz = (freqHz: number): string => {
    return (freqHz / 1e6).toFixed(2)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isLoading}
    >
      <DialogTitle>Frequency Sweep Configuration</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Start Frequency */}
          <Controller
            name="startFrequency"
            control={control}
            render={({ field }) => (
              <FrequencyInputField
                fieldValue={field.value}
                onFieldChange={field.onChange}
                label="Start Frequency (MHz)"
                error={!!errors.startFrequency}
                helperText={errors.startFrequency?.message}
                disabled={isLoading}
              />
            )}
          />

          {/* Stop Frequency */}
          <Controller
            name="stopFrequency"
            control={control}
            render={({ field }) => (
              <FrequencyInputField
                fieldValue={field.value}
                onFieldChange={field.onChange}
                label="Stop Frequency (MHz)"
                error={!!errors.stopFrequency}
                helperText={errors.stopFrequency?.message}
                disabled={isLoading}
              />
            )}
          />

          {/* Number of Points */}
          <Box>
            <Typography gutterBottom>
              Number of Points: {numPoints}
            </Typography>
            <Controller
              name="numPoints"
              control={control}
              render={({ field }) => (
                <Slider
                  {...field}
                  min={2}
                  max={100}
                  step={1}
                  marks={[
                    { value: 2, label: '2' },
                    { value: 25, label: '25' },
                    { value: 50, label: '50' },
                    { value: 75, label: '75' },
                    { value: 100, label: '100' },
                  ]}
                  valueLabelDisplay="auto"
                  disabled={isLoading}
                />
              )}
            />
            {errors.numPoints && (
              <Typography color="error" variant="caption">
                {errors.numPoints.message}
              </Typography>
            )}
          </Box>

          {/* Spacing Type */}
          <FormControl component="fieldset" disabled={isLoading}>
            <FormLabel component="legend">Frequency Spacing</FormLabel>
            <Controller
              name="spacing"
              control={control}
              render={({ field }) => (
                <RadioGroup {...field} row>
                  <FormControlLabel
                    value="linear"
                    control={<Radio />}
                    label="Linear"
                  />
                  <FormControlLabel
                    value="logarithmic"
                    control={<Radio />}
                    label="Logarithmic"
                  />
                </RadioGroup>
              )}
            />
          </FormControl>

          {/* Sweep Summary */}
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Sweep Range:</strong> {formatFreqMHz(startFreq)} MHz → {formatFreqMHz(stopFreq)} MHz
            </Typography>
            <Typography variant="body2">
              <strong>Total Simulations:</strong> {numPoints}
            </Typography>
            <Typography variant="body2">
              <strong>Estimated Time:</strong> ~{Math.round(numPoints * 0.5)} seconds
            </Typography>
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit(handleFormSubmit)}
          variant="contained"
          disabled={isLoading}
        >
          {isLoading ? 'Running Sweep...' : 'Run Sweep'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
