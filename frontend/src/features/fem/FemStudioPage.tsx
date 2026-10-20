import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Button, Chip, IconButton, Paper, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import {
  ArrowForward,
  CheckCircle,
  Close,
  ErrorOutline,
  Lock,
  RadioButtonUnchecked,
  School,
  Description,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { closePanel, openPanel, togglePanel } from '@/store/documentationSlice';
import DocumentationPanel from '@/features/design/DocumentationPanel';
import { FEM_STEPS, nextStep, stepStatuses, type FemStepId, type FemStepStatus } from './workflow';
import { useFemStudio, type SaveStatus } from './useFemStudio';
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

const SAVE_TEXT: Record<SaveStatus, string> = {
  loading: 'Loading…',
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  error: 'Not saved',
  draft: 'Draft in this browser',
};

/**
 * FEM Studio (preview, behind VITE_FEATURE_FEM): the FEM workflow as tabs.
 * Each tab shows its status; a Learn panel explains what the step means.
 */
function FemStudioPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const studio = useFemStudio(projectId);
  const dispatch = useAppDispatch();
  const [active, setActive] = useState<FemStepId>('geometry');
  // Right panel (shared with the antenna designer): the project's documentation,
  // or "Learn" — what the current step means. Course projects open on their text.
  const panelOpen = useAppSelector((s) => s.documentation.panelOpen);
  const [chosenTab, setPanelTab] = useState<'docs' | 'learn' | null>(null);
  const panelTab = chosenTab ?? (studio.project?.fromCourse ? 'docs' : 'learn');
  useEffect(() => {
    dispatch(openPanel());
  }, [dispatch]);
  const showDocs = !!projectId && panelTab === 'docs';
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
          {studio.project?.name ?? studio.model.name} · 2D electrostatics
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={studio.saveStatus === 'error' ? 'error' : 'default'}
          label={SAVE_TEXT[studio.saveStatus]}
        />
        <Box sx={{ flex: 1 }} />
        {next && next !== active && (
          <Button endIcon={<ArrowForward />} onClick={() => setActive(next)}>
            Next: {FEM_STEPS.find((s) => s.id === next)!.label}
          </Button>
        )}
        {!panelOpen && (
          <Button startIcon={projectId ? <Description /> : <School />} onClick={() => dispatch(togglePanel())}>
            {projectId ? 'Documentation' : 'Learn'}
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

        {panelOpen && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
            {projectId && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={panelTab}
                onChange={(_, v) => v && setPanelTab(v)}
                aria-label="Right panel"
              >
                <ToggleButton value="docs">
                  <Description fontSize="small" sx={{ mr: 0.5 }} /> Documentation
                </ToggleButton>
                <ToggleButton value="learn">
                  <School fontSize="small" sx={{ mr: 0.5 }} /> Learn
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {showDocs ? (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <DocumentationPanel projectId={projectId!} />
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ width: 320, p: 2, overflow: 'auto', flex: 1 }} aria-label="Learn">
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <School fontSize="small" color="primary" />
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>
                    Learn: {step.label}
                  </Typography>
                  <Tooltip title="Hide">
                    <IconButton size="small" aria-label="Hide the Learn panel" onClick={() => dispatch(closePanel())}>
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
        )}
      </Box>
    </Box>
  );
}

export default FemStudioPage;
