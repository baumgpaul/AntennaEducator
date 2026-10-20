import { Children, isValidElement } from 'react';
import { Box, Divider, IconButton, Paper, Tooltip, Typography, type SxProps } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';

/**
 * The layout of every workflow tab, for every method: a ribbon of captioned
 * action groups, a settings panel on the left, the canvas filling the rest
 * (the result is what matters), and an optional properties panel on the right.
 */
export function Workspace({
  ribbon,
  left,
  right,
  rightTitle,
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
  rightOpen?: boolean;
  onRightToggle?: () => void;
  /** Alerts above the canvas (what to fix, out-of-date results) */
  notes?: React.ReactNode;
  children: React.ReactNode;
  canvasSx?: SxProps;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      {ribbon}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {left && (
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            {left}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {notes && <Box sx={{ px: 1.5, pt: 1.5 }}>{notes}</Box>}
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', ...canvasSx }}>
            {children}
          </Box>
        </Box>
        {right && rightOpen && (
          <Box
            sx={{
              width: 260,
              flexShrink: 0,
              borderLeft: 1,
              borderColor: 'divider',
              overflow: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            <PanelSection
              title={rightTitle ?? 'Properties'}
              action={
                onRightToggle && (
                  <Tooltip title="Hide">
                    <IconButton size="small" aria-label="Hide the properties" onClick={onRightToggle}>
                      <ChevronRight fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )
              }
            >
              {right}
            </PanelSection>
          </Box>
        )}
        {right && !rightOpen && onRightToggle && (
          <Box sx={{ borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', pt: 0.5 }}>
            <Tooltip title={`Show ${(rightTitle ?? 'properties').toLowerCase()}`}>
              <IconButton size="small" aria-label="Show the properties" onClick={onRightToggle}>
                <ChevronLeft fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** The action bar above a tab: groups with a caption, divided by lines. */
export function Ribbon({ children }: { children: React.ReactNode }) {
  const groups = Children.toArray(children).filter(isValidElement);
  return (
    <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 1.5, minHeight: 80, display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {groups.flatMap((g, i) => (i === 0 ? [g] : [<Divider key={`d${i}`} orientation="vertical" flexItem />, g]))}
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>{children}</Box>
    </Box>
  );
}

/** A titled section of a side panel (like "Variables" or "Structure"). */
export function PanelSection({
  title,
  action,
  children,
  dense,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** No padding around the content (lists) */
  dense?: boolean;
}) {
  return (
    <Box>
      <Box
        sx={{
          px: 2,
          py: 1,
          minHeight: 42,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children && <Box sx={dense ? undefined : { p: 2 }}>{children}</Box>}
    </Box>
  );
}

/** Short explanatory text under a canvas or in a panel. */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.5 }}>
      {children}
    </Typography>
  );
}
