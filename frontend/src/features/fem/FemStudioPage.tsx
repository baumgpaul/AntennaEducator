import { useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import {
  ArrowForward,
  CheckCircle,
  Close,
  ErrorOutline,
  Lock,
  RadioButtonUnchecked,
  School,
} from '@mui/icons-material';
import { FEM_STEPS, nextStep, stepStatuses, type FemStepId, type FemStepStatus } from './workflow';
import { useFemStudio } from './useFemStudio';
import GeometryTab from './tabs/GeometryTab';
import MaterialsTab from './tabs/MaterialsTab';
import PhysicsTab from './tabs/PhysicsTab';
import MeshTab from './tabs/MeshTab';
import SolveTab from './tabs/SolveTab';
import ResultsTab from './tabs/ResultsTab';

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

const TAB_CONTENT = {
  geometry: GeometryTab,
  materials: MaterialsTab,
  physics: PhysicsTab,
  mesh: MeshTab,
  solve: SolveTab,
  results: ResultsTab,
} satisfies Record<FemStepId, unknown>;

/**
 * FEM Studio (preview, behind VITE_FEATURE_FEM): the FEM workflow as tabs.
 * Each tab shows its status; a Learn panel explains what the step means.
 */
function FemStudioPage() {
  const studio = useFemStudio();
  const [active, setActive] = useState<FemStepId>('geometry');
  const [learnOpen, setLearnOpen] = useState(true);
  const { progress } = studio;
  const statuses = useMemo(() => stepStatuses(progress.done, progress.attention), [progress]);
  const step = FEM_STEPS.find((s) => s.id === active)!;
  const next = nextStep(statuses);
  const Content = TAB_CONTENT[active];

  return (
    <Box data-testid="fem-studio" sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h5">FEM Studio</Typography>
        <Chip label="Preview" color="warning" size="small" />
        <Typography color="text.secondary" sx={{ ml: 1 }}>
          {studio.model.name} · 2D electrostatics
        </Typography>
        <Box sx={{ flex: 1 }} />
        {next && next !== active && (
          <Button endIcon={<ArrowForward />} onClick={() => setActive(next)}>
            Next: {FEM_STEPS.find((s) => s.id === next)!.label}
          </Button>
        )}
        {!learnOpen && (
          <Button startIcon={<School />} onClick={() => setLearnOpen(true)}>
            Learn
          </Button>
        )}
      </Stack>

      <Tabs value={active} onChange={(_, v: FemStepId) => setActive(v)} variant="scrollable" aria-label="FEM workflow steps">
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {statuses[active] === 'locked' ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6">{step.label}</Typography>
              <Typography color="text.secondary">{step.summary}</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                This step opens once{' '}
                {step.requires.map((r) => FEM_STEPS.find((s) => s.id === r)!.label).join(', ')} is complete.
              </Typography>
            </Paper>
          ) : (
            <Content studio={studio} />
          )}
        </Box>

        {learnOpen && (
          <Paper variant="outlined" sx={{ width: 320, p: 2, overflow: 'auto' }} aria-label="Learn">
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <School fontSize="small" color="primary" />
              <Typography variant="subtitle1" sx={{ flex: 1 }}>
                Learn: {step.label}
              </Typography>
              <Tooltip title="Hide">
                <IconButton size="small" aria-label="Hide the Learn panel" onClick={() => setLearnOpen(false)}>
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            {step.learn.map((paragraph) => (
              <Typography key={paragraph} variant="body2" paragraph>
                {paragraph}
              </Typography>
            ))}
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default FemStudioPage;
