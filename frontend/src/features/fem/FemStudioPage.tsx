import { useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import {
  CheckCircle,
  ErrorOutline,
  Lock,
  RadioButtonUnchecked,
  ArrowForward,
  School,
} from '@mui/icons-material';
import { FEM_STEPS, nextStep, stepStatuses, type FemStepId, type FemStepStatus } from './workflow';

const STATUS_ICON: Record<FemStepStatus, JSX.Element> = {
  done: <CheckCircle color="success" fontSize="small" />,
  attention: <ErrorOutline color="warning" fontSize="small" />,
  todo: <RadioButtonUnchecked fontSize="small" />,
  locked: <Lock fontSize="small" color="disabled" />,
};

const STATUS_TEXT: Record<FemStepStatus, string> = {
  done: 'done',
  attention: 'needs attention',
  todo: 'to do',
  locked: 'locked: finish the previous steps first',
};

/**
 * FEM Studio (preview, behind VITE_FEATURE_FEM): the FEM workflow as tabs,
 * each with a Learn panel. Phase 0 is the shell; the steps are filled in by
 * the following phases.
 */
function FemStudioPage() {
  const [active, setActive] = useState<FemStepId>('geometry');
  // Nothing is modelled yet: the first step is open, the others are locked
  const statuses = useMemo(() => stepStatuses(new Set()), []);
  const step = FEM_STEPS.find((s) => s.id === active)!;
  const next = nextStep(statuses);

  return (
    <Box data-testid="fem-studio" sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h5">FEM Studio</Typography>
        <Chip label="Preview" color="warning" size="small" />
      </Stack>

      <Tabs
        value={active}
        onChange={(_, value: FemStepId) => setActive(value)}
        variant="scrollable"
        aria-label="FEM workflow steps"
      >
        {FEM_STEPS.map((s, i) => (
          <Tab
            key={s.id}
            value={s.id}
            icon={STATUS_ICON[statuses[s.id]]}
            iconPosition="start"
            label={`${i + 1} ${s.label}`}
            title={`${s.label}: ${STATUS_TEXT[statuses[s.id]]}`}
          />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', flex: 1, gap: 2, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">{step.label}</Typography>
          <Typography color="text.secondary">{step.summary}</Typography>
          {statuses[step.id] === 'locked' && (
            <Typography color="text.secondary">
              This step opens once {step.requires.map((r) => FEM_STEPS.find((s) => s.id === r)!.label).join(', ')}{' '}
              is complete.
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          {next && next !== active && (
            <Box>
              <Button endIcon={<ArrowForward />} onClick={() => setActive(next)}>
                Next: {FEM_STEPS.find((s) => s.id === next)!.label}
              </Button>
            </Box>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ width: 340, p: 2, overflow: 'auto' }} aria-label="Learn">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <School fontSize="small" color="primary" />
            <Typography variant="subtitle1">Learn: {step.label}</Typography>
          </Stack>
          {step.learn.map((paragraph) => (
            <Typography key={paragraph} variant="body2" paragraph>
              {paragraph}
            </Typography>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}

export default FemStudioPage;
