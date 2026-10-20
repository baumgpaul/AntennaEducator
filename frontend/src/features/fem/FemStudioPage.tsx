import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Chip, Tooltip, Typography } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { openPanel, togglePanel } from '@/store/documentationSlice';
import WorkflowBar from '@/features/workflow/WorkflowBar';
import SidePanel, { type SidePanelTab } from '@/features/workflow/SidePanel';
import LockedStep from '@/features/workflow/LockedStep';
import { FEM_STEPS, nextStep, stepStatuses, type FemStepId } from './workflow';
import { useFemStudio, type SaveStatus } from './useFemStudio';
import GeometryTab from './tabs/GeometryTab';
import MaterialsTab from './tabs/MaterialsTab';
import PhysicsTab from './tabs/PhysicsTab';
import MeshTab from './tabs/MeshTab';
import SolveTab from './tabs/SolveTab';
import ResultsTab from './tabs/ResultsTab';

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
 * FEM Studio (preview, behind VITE_FEATURE_FEM): the FEM workflow as tabs,
 * in the same shell as the antenna designer (status per step, Next, and the
 * right panel with the project's documentation and Learn).
 */
function FemStudioPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const studio = useFemStudio(projectId);
  const dispatch = useAppDispatch();
  const [active, setActive] = useState<FemStepId>('geometry');
  // Course projects open on their documentation, new ones on Learn
  const panelOpen = useAppSelector((s) => s.documentation.panelOpen);
  const [chosenTab, setPanelTab] = useState<SidePanelTab | null>(null);
  const panelTab = chosenTab ?? (studio.project?.fromCourse ? 'docs' : 'learn');
  useEffect(() => {
    dispatch(openPanel());
  }, [dispatch]);
  const { progress } = studio;
  const statuses = useMemo(() => stepStatuses(progress.done, progress.attention), [progress]);
  const step = FEM_STEPS.find((s) => s.id === active)!;
  const next = nextStep(statuses);
  const Content = TAB_CONTENT[active];

  return (
    <Box data-testid="fem-studio" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkflowBar
        steps={FEM_STEPS}
        statuses={statuses}
        active={active}
        onChange={setActive}
        notes={progress.notes}
        next={next}
        panelOpen={panelOpen}
        onTogglePanel={() => dispatch(togglePanel())}
        extra={
          <>
            <Tooltip title="The FEM workspace is a preview: it may still change">
              <Chip label="Preview" color="warning" size="small" />
            </Tooltip>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220, display: { xs: 'none', xl: 'block' } }}>
              {studio.project?.name ?? studio.model.name} · 2D electrostatics
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={studio.saveStatus === 'error' ? 'error' : 'default'}
              label={SAVE_TEXT[studio.saveStatus]}
            />
          </>
        }
      />
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {statuses[active] === 'locked' ? <LockedStep step={step} steps={FEM_STEPS} /> : <Content studio={studio} />}
        </Box>
        {panelOpen && <SidePanel projectId={projectId} tab={panelTab} onTabChange={setPanelTab} step={step} />}
      </Box>
    </Box>
  );
}

export default FemStudioPage;
