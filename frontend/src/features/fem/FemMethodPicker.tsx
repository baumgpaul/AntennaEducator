import { Box, Chip, FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Typography } from '@mui/material';
import { useAppSelector } from '@/store/hooks';
import { canUseFem } from '@/config/features';
import { EMPTY_MODEL, TEMPLATES, type FemModel, type TemplateId } from './model';

export interface MethodChoice {
  kind: 'peec' | 'fem';
  template: TemplateId | 'empty';
  /** Initial FEM model (the chosen template), stored as the project's design_state */
  design_state?: FemModel;
}

function withModel(choice: MethodChoice): MethodChoice {
  if (choice.kind !== 'fem') return { ...choice, design_state: undefined };
  const t = TEMPLATES.find((x) => x.id === choice.template);
  return { ...choice, design_state: structuredClone(t ? t.model : EMPTY_MODEL) };
}

/**
 * Method choice in the New-project dialog: antenna (PEEC) or FEM field problem.
 * Loaded only in builds with the FEM flag, shown only to users who may use it.
 */
function FemMethodPicker({ value, onChange }: { value: MethodChoice; onChange: (v: MethodChoice) => void }) {
  const user = useAppSelector((state) => state.auth.user);
  if (!canUseFem(user)) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Method
      </Typography>
      <RadioGroup value={value.kind} onChange={(e) => onChange(withModel({ ...value, kind: e.target.value as MethodChoice['kind'] }))}>
        <FormControlLabel value="peec" control={<Radio />} label="Antenna (PEEC): wires, circuits, radiation" />
        <FormControlLabel
          value="fem"
          control={<Radio />}
          label={
            <span>
              Field problem (FEM, 2D electrostatics) <Chip label="Preview" color="warning" size="small" />
            </span>
          }
        />
      </RadioGroup>
      {value.kind === 'fem' && (
        <TextField
          select
          size="small"
          label="Start from"
          value={value.template}
          onChange={(e) => onChange(withModel({ ...value, template: e.target.value as MethodChoice['template'] }))}
          sx={{ mt: 1, minWidth: 240 }}
        >
          {TEMPLATES.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.title}
            </MenuItem>
          ))}
          <MenuItem value="empty">Empty model</MenuItem>
        </TextField>
      )}
    </Box>
  );
}

export default FemMethodPicker;
