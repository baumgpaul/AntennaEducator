import { Paper, Typography } from '@mui/material';
import type { WorkflowStep } from './steps';

/** Shown instead of a locked step: what it is, and what has to be done first. */
function LockedStep<Id extends string>({ step, steps }: { step: WorkflowStep<Id>; steps: WorkflowStep<Id>[] }) {
  const needed = step.requires.map((r) => steps.find((s) => s.id === r)!.label).join(', ');
  return (
    <Paper variant="outlined" sx={{ p: 3, m: 2 }}>
      <Typography variant="h6">{step.label}</Typography>
      <Typography color="text.secondary">{step.summary}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        This step opens once {needed} is complete.
      </Typography>
    </Paper>
  );
}

export default LockedStep;
