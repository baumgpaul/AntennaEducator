import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { ArrowForward, Description } from '@mui/icons-material';
import WorkflowTabs from './WorkflowTabs';
import type { StepStatus, WorkflowStep } from './steps';

interface Props<Id extends string> {
  steps: WorkflowStep<Id>[];
  statuses: Record<Id, StepStatus>;
  active: Id;
  onChange: (id: Id) => void;
  numbered?: boolean;
  notes?: Partial<Record<Id, string[]>>;
  /** The step to suggest next, if any */
  next?: Id | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Status chips (saved, preview …) before the Next button */
  extra?: React.ReactNode;
}

/** The bar on top of both workspaces: step tabs, then Next and the documentation / Learn panel toggle. */
function WorkflowBar<Id extends string>({ next, panelOpen, onTogglePanel, extra, ...tabs }: Props<Id>) {
  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pr: 1,
      }}
    >
      <WorkflowTabs {...tabs} sx={{ flex: 1, minWidth: 0 }} />
      {extra}
      {next && next !== tabs.active && (
        <Button size="small" endIcon={<ArrowForward />} onClick={() => tabs.onChange(next)}>
          Next: {tabs.steps.find((s) => s.id === next)!.label}
        </Button>
      )}
      <Tooltip title={panelOpen ? 'Hide documentation and Learn' : 'Show documentation and Learn'}>
        <IconButton
          size="small"
          aria-label={panelOpen ? 'Hide documentation and Learn' : 'Show documentation and Learn'}
          onClick={onTogglePanel}
          color={panelOpen ? 'primary' : 'default'}
        >
          <Description fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default WorkflowBar;
