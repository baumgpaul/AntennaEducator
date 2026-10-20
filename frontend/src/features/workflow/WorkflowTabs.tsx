import { Tab, Tabs } from '@mui/material';
import { CheckCircle, ErrorOutline, Lock, RadioButtonUnchecked } from '@mui/icons-material';
import { STATUS_TEXT, type StepStatus, type WorkflowStep } from './steps';

const STATUS_ICON: Record<StepStatus, JSX.Element> = {
  done: <CheckCircle color="success" fontSize="small" />,
  attention: <ErrorOutline color="warning" fontSize="small" />,
  todo: <RadioButtonUnchecked fontSize="small" />,
  locked: <Lock fontSize="small" color="disabled" />,
};

interface Props<Id extends string> {
  steps: WorkflowStep<Id>[];
  statuses: Record<Id, StepStatus>;
  active: Id;
  onChange: (id: Id) => void;
  /** Number the steps ("1 Geometry") */
  numbered?: boolean;
  /** Extra notes per step for the tooltip (why it needs attention) */
  notes?: Partial<Record<Id, string[]>>;
  sx?: object;
}

/** Step tabs with a status icon each; locked steps can be opened to see why they are locked. */
function WorkflowTabs<Id extends string>({ steps, statuses, active, onChange, numbered, notes, sx }: Props<Id>) {
  return (
    <Tabs value={active} onChange={(_, v: Id) => onChange(v)} variant="scrollable" aria-label="Workflow steps" sx={sx}>
      {steps.map((s, i) => (
        <Tab
          key={s.id}
          value={s.id}
          icon={STATUS_ICON[statuses[s.id]]}
          iconPosition="start"
          label={numbered ? `${i + 1} ${s.label}` : s.label}
          title={[`${s.label}: ${STATUS_TEXT[statuses[s.id]]}`, ...(notes?.[s.id] ?? [])].join('\n')}
          sx={{ minHeight: 48 }}
        />
      ))}
    </Tabs>
  );
}

export default WorkflowTabs;
