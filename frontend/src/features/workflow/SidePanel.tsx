import { Box, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { Close, Description, School } from '@mui/icons-material';
import { useAppDispatch } from '@/store/hooks';
import { closePanel } from '@/store/documentationSlice';
import DocumentationPanel from '@/features/design/DocumentationPanel';
import type { WorkflowStep } from './steps';

export type SidePanelTab = 'docs' | 'learn';

interface Props {
  /** Without a project there is nothing to document: Learn only */
  projectId?: string;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  step: WorkflowStep;
}

/**
 * The right-hand panel of both workspaces: the project's documentation
 * (markdown, formulas, images — course texts and notes) or "Learn", what the
 * current step means for the method.
 */
function SidePanel({ projectId, tab, onTabChange, step }: Props) {
  const dispatch = useAppDispatch();
  const showDocs = !!projectId && tab === 'docs';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, height: '100%' }}>
      {projectId && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tab}
          onChange={(_, v: SidePanelTab | null) => v && onTabChange(v)}
          aria-label="Right panel"
          sx={{ px: 1, pt: 1 }}
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
  );
}

export default SidePanel;
