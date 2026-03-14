/**
 * PlotContainer — Responsive wrapper for visualization plots.
 *
 * Provides a titled, bordered container with optional toolbar actions.
 */

import { Box, Paper, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material'
import { Visibility, VisibilityOff, Delete as DeleteIcon } from '@mui/icons-material'

interface PlotContainerProps {
  title: string
  subtitle?: string
  visible?: boolean
  loading?: boolean
  onToggleVisibility?: () => void
  onDelete?: () => void
  children: React.ReactNode
  height?: number | string
}

function PlotContainer({
  title,
  subtitle,
  visible = true,
  loading = false,
  onToggleVisibility,
  onDelete,
  children,
  height = 350,
}: PlotContainerProps) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
        {loading && <CircularProgress size={16} />}
        {onToggleVisibility && (
          <Tooltip title={visible ? 'Hide' : 'Show'}>
            <IconButton size="small" onClick={onToggleVisibility}>
              {visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="Remove">
            <IconButton size="small" onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Content */}
      {visible && (
        <Box sx={{ height, p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <CircularProgress />
          ) : (
            <Box sx={{ width: '100%', height: '100%' }}>{children}</Box>
          )}
        </Box>
      )}
    </Paper>
  )
}

export default PlotContainer
