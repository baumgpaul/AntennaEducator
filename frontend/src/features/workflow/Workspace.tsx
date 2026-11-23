import { Children, Fragment, isValidElement, useCallback } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  ButtonGroup,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  type SxProps,
} from '@mui/material';
import { ChevronLeft, ChevronRight, ExpandMore } from '@mui/icons-material';

/*
 * The layout of every workflow tab, for both methods, in the antenna
 * designer's look: a ribbon of captioned groups of joined buttons, side panels
 * with a round toggle on their edge (optionally resizable, the width
 * remembered), and the canvas filling the rest.
 * (No preview feature names here: the antenna designer's bundle includes this file.)
 */

/**
 * A tab's layout: ribbon, a settings panel on the left, the canvas, and an
 * optional properties panel on the right that the user can hide.
 */
export function Workspace({
  ribbon,
  left,
  right,
  rightTitle,
  rightSubtitle,
  rightOpen = true,
  onRightToggle,
  notes,
  children,
  canvasSx,
}: {
  ribbon?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  rightTitle?: string;
  /** Under the title, e.g. the name of what is selected */
  rightSubtitle?: React.ReactNode;
  rightOpen?: boolean;
  onRightToggle?: () => void;
  /** Alerts above the canvas (what to fix, out-of-date results) */
  notes?: React.ReactNode;
  children: React.ReactNode;
  canvasSx?: SxProps;
}) {
  const title = rightTitle ?? 'Properties';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      {ribbon}
      <PanelRow>
        {left && (
          <WorkspacePanel side="left" width={280}>
            {left}
          </WorkspacePanel>
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {notes && <Box sx={{ px: 1.5, pt: 1.5 }}>{notes}</Box>}
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', ...canvasSx }}>
            {children}
          </Box>
        </Box>
        {right && (
          <WorkspacePanel side="right" width={300} open={rightOpen} onToggle={onRightToggle} label={title}>
            <PanelHeader title={title} subtitle={rightSubtitle} />
            <Box sx={{ p: 2 }}>{right}</Box>
          </WorkspacePanel>
        )}
      </PanelRow>
    </Box>
  );
}

/** The row that holds the side panels and the canvas (the closed panels' toggles sit on its edges). */
export function PanelRow({ children, sx }: { children: React.ReactNode; sx?: SxProps }) {
  return <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', ...sx }}>{children}</Box>;
}

const TOGGLE_SX = { bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'action.hover' } } as const;

/** The round toggle on a panel's inner edge (open) or on the row's edge (closed). */
function EdgeToggle({ side, open, title, onClick }: { side: 'left' | 'right'; open: boolean; title: string; onClick: () => void }) {
  const at: React.CSSProperties = open ? (side === 'left' ? { right: '-20px' } : { left: '-20px' }) : side === 'left' ? { left: 0 } : { right: 0 };
  return (
    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 20, ...at }}>
      <Tooltip title={title} placement={side === 'left' ? 'right' : 'left'}>
        <IconButton size="medium" onClick={onClick} sx={TOGGLE_SX}>
          {(side === 'left') === open ? <ChevronLeft fontSize="large" /> : <ChevronRight fontSize="large" />}
        </IconButton>
      </Tooltip>
    </div>
  );
}


/** The 4 px drag strip between a panel and the canvas. */
function ResizeHandle({ side, width, min, max, onChange }: { side: 'left' | 'right'; width: number; min: number; max: number; onChange: (w: number) => void }) {
  const start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const move = (ev: MouseEvent) => {
        const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
        onChange(Math.min(max, Math.max(min, width + delta)));
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [side, width, min, max, onChange],
  );
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      onMouseDown={start}
      sx={{
        width: '4px',
        cursor: 'col-resize',
        flexShrink: 0,
        position: 'relative',
        zIndex: 15,
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.3)' },
      }}
    />
  );
}

/**
 * A side panel (put it in a PanelRow). With `onToggle` it gets the round
 * hide/show button on its edge; with `resize` the user can drag its width.
 */
export function WorkspacePanel({
  side,
  width,
  open = true,
  onToggle,
  label = side === 'left' ? 'Tree View' : 'Properties',
  resize,
  overflow = 'auto',
  children,
}: {
  side: 'left' | 'right';
  width: number;
  open?: boolean;
  onToggle?: () => void;
  /** Used in the toggle's tooltip: "Hide <label>" / "Show <label>" */
  label?: string;
  resize?: { min: number; max: number; onChange: (w: number) => void };
  /** 'hidden' when the content scrolls itself */
  overflow?: 'auto' | 'hidden';
  children: React.ReactNode;
}) {
  if (!open) return onToggle ? <EdgeToggle side={side} open={false} title={`Show ${label}`} onClick={onToggle} /> : null;
  const panel = (
    <Box
      sx={{
        width,
        flexShrink: 0,
        position: 'relative',
        overflow,
        bgcolor: 'background.paper',
        // the border shorthand first: it would reset the colour
        ...(side === 'left' ? { borderRight: 1 } : { borderLeft: 1 }),
        borderColor: 'divider',
      }}
    >
      {children}
      {onToggle && <EdgeToggle side={side} open title={`Hide ${label}`} onClick={onToggle} />}
    </Box>
  );
  const handle = resize && <ResizeHandle side={side} width={width} {...resize} />;
  return side === 'left' ? (
    <>
      {panel}
      {handle}
    </>
  ) : (
    <>
      {handle}
      {panel}
    </>
  );
}

/** The buttons of a ribbon group: outlined, small and joined. */
export function RibbonButtons({ children }: { children: React.ReactNode }) {
  return (
    <ButtonGroup variant="outlined" size="small">
      {children}
    </ButtonGroup>
  );
}

/** The groups of a ribbon, also inside fragments (sets of groups shown together). */
function ribbonGroups(children: React.ReactNode): React.ReactElement[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return ribbonGroups((child.props as { children?: React.ReactNode }).children);
    return [child];
  });
}

/** The action bar above a tab: groups with a caption, divided by lines. */
export function Ribbon({ children }: { children: React.ReactNode }) {
  const groups = ribbonGroups(children);
  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {groups.map((g, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider orientation="vertical" flexItem />}
            {g}
          </Fragment>
        ))}
      </Box>
    </Paper>
  );
}

export function RibbonGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        {label}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** The header of a properties panel: its title and what it shows (the element, the view). */
export function PanelHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>
        {title}
      </Typography>
      {subtitle != null && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

/** The header bar of a list in a side panel (like "Result Views" or "Requested Quantities"). */
export function PanelSection({
  title,
  extra,
  action,
  children,
  dense,
  sx,
}: {
  title: string;
  /** Shown right after the title (status chips) */
  extra?: React.ReactNode;
  /** Shown at the right end (add buttons) */
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** No padding around the content (lists) */
  dense?: boolean;
  sx?: SxProps;
}) {
  return (
    <Box sx={sx}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {extra}
        {action && <Box sx={{ ml: 'auto', my: -1 }}>{action}</Box>}
      </Box>
      {children && <Box sx={dense ? undefined : { p: 2 }}>{children}</Box>}
    </Box>
  );
}

/** A collapsible section of a side panel (like "Variables" or "Structure"), open at first. */
export function CollapsibleSection({
  title,
  action,
  children,
  dense,
  detailsSx,
  defaultExpanded = true,
}: {
  title: string;
  /** Shown at the right end of the header, before the chevron (add buttons) */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** No padding around the content (lists) */
  dense?: boolean;
  detailsSx?: SxProps;
  defaultExpanded?: boolean;
}) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      defaultExpanded={defaultExpanded}
      sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent', borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        // the summary is a <button>: with a button inside it, it must be a div
        component={action ? 'div' : undefined}
        sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' }, px: 2 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {action && (
          // clicks on the action must not open or close the section
          <Box sx={{ ml: 'auto', mr: 0.5, my: -1 }} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()}>
            {action}
          </Box>
        )}
      </AccordionSummary>
      <AccordionDetails sx={detailsSx ?? (dense ? { p: 0 } : { p: 2 })}>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Short explanatory text under a canvas or in a panel. */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      component="div"
      sx={{
        color: "text.secondary",
        lineHeight: 1.5
      }}>
      {children}
    </Typography>
  );
}
