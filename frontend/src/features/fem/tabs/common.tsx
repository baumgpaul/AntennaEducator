import { Alert, Stack, TextField } from '@mui/material';
import { parseExprInput, type Expr } from '../expressions';

/** Number or expression of the parameters ("2*d"). */
export function ExprField({
  label,
  value,
  onChange,
  width = 110,
  helper,
}: {
  label: string;
  value: Expr;
  onChange: (v: Expr) => void;
  width?: number;
  helper?: string;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={String(value)}
      helperText={helper}
      onChange={(e) => onChange(parseExprInput(e.target.value))}
      sx={{ width }}
      inputProps={{ spellCheck: false }}
    />
  );
}

/** Checklist entries of a step: what to fix, and why it matters. */
export function StepNotes({ notes, error }: { notes?: string[]; error?: string | null }) {
  if (!notes?.length && !error) return null;
  return (
    <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      {notes?.map((n) => (
        <Alert key={n} severity="warning">
          {n}
        </Alert>
      ))}
    </Stack>
  );
}
