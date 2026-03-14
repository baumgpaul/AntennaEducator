/**
 * FdtdPostprocessingTab — Main orchestrator for FDTD postprocessing views.
 *
 * Left panel: view tree (view configurations + items).
 * Main area: visualization component dispatched by view item type.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Paper,
  Alert,
  Stack,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Collapse,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Visibility,
  VisibilityOff,
  ExpandMore,
  ChevronRight,
  Map as HeatmapIcon,
  Timeline as TimelineIcon,
  Radar as RadarIcon,
  ShowChart as ChartIcon,
  Whatshot as SarIcon,
  Air as EnergyIcon,
  TrackChanges as RcsIcon,
  Waves as FreqIcon,
  Sensors as ProbeIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  createView,
  deleteView,
  selectView,
  selectItem,
  addItemToView,
  removeItemFromView,
  toggleItemVisibility,
  selectFdtdViews,
  selectFdtdSelectedViewId,
  selectFdtdSelectedView,
  selectFdtdSelectedItemId,
} from '@/store/fdtdPostprocessingSlice'
import type { FdtdViewItemType } from '@/types/fdtd'
import FieldHeatmap from './FieldHeatmap'
import TimeAnimation from './TimeAnimation'
import RadiationPattern from './RadiationPattern'
import SParameterPlot from './SParameterPlot'
import SARMap from './SARMap'
import EnergyFlow from './EnergyFlow'
import RCSPlot from './RCSPlot'
import FrequencyFieldMap from './FrequencyFieldMap'
import ProbeTimeSeries from './ProbeTimeSeries'

// Item-type metadata for menus and icons
const ITEM_TYPE_META: {
  type: FdtdViewItemType
  label: string
  icon: React.ReactNode
}[] = [
  { type: 'field_heatmap', label: 'Field Heatmap', icon: <HeatmapIcon fontSize="small" /> },
  { type: 'time_animation', label: 'Time Animation', icon: <TimelineIcon fontSize="small" /> },
  { type: 'radiation_pattern', label: 'Radiation Pattern', icon: <RadarIcon fontSize="small" /> },
  { type: 's_parameters', label: 'S-Parameters', icon: <ChartIcon fontSize="small" /> },
  { type: 'sar_map', label: 'SAR Map', icon: <SarIcon fontSize="small" /> },
  { type: 'energy_flow', label: 'Energy Flow', icon: <EnergyIcon fontSize="small" /> },
  { type: 'rcs_plot', label: 'RCS', icon: <RcsIcon fontSize="small" /> },
  { type: 'frequency_field', label: 'Frequency Field', icon: <FreqIcon fontSize="small" /> },
  { type: 'probe_time_series', label: 'Probe Time Series', icon: <ProbeIcon fontSize="small" /> },
]

function getIconForType(type: FdtdViewItemType): React.ReactNode {
  return ITEM_TYPE_META.find((m) => m.type === type)?.icon ?? <HeatmapIcon fontSize="small" />
}

// ---------------------------------------------------------------------------
// ViewItemRenderer — dispatches to the correct visualization component
// ---------------------------------------------------------------------------
function ViewItemRenderer({ type }: { type: FdtdViewItemType }) {
  switch (type) {
    case 'field_heatmap':
      return <FieldHeatmap />
    case 'time_animation':
      return <TimeAnimation />
    case 'radiation_pattern':
      return <RadiationPattern />
    case 's_parameters':
      return <SParameterPlot />
    case 'sar_map':
      return <SARMap />
    case 'energy_flow':
      return <EnergyFlow />
    case 'rcs_plot':
      return <RCSPlot />
    case 'frequency_field':
      return <FrequencyFieldMap />
    case 'probe_time_series':
      return <ProbeTimeSeries />
    default:
      return <Typography color="text.secondary">Unknown view type: {type}</Typography>
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function FdtdPostprocessingTab() {
  const dispatch = useAppDispatch()
  const views = useAppSelector(selectFdtdViews)
  const selectedViewId = useAppSelector(selectFdtdSelectedViewId)
  const selectedView = useAppSelector(selectFdtdSelectedView)
  const selectedItemId = useAppSelector(selectFdtdSelectedItemId)
  const simulationStatus = useAppSelector((s) => s.fdtdSolver.status)
  const computeError = useAppSelector((s) => s.fdtdPostprocessing.computeError)

  // Local UI state
  const [expandedViews, setExpandedViews] = useState<Set<string>>(new Set())
  const [addItemAnchor, setAddItemAnchor] = useState<null | HTMLElement>(null)
  const [addItemViewId, setAddItemViewId] = useState<string | null>(null)
  const [newViewDialogOpen, setNewViewDialogOpen] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Guard: need completed simulation
  if (simulationStatus !== 'completed') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Run a simulation first to view post-processing results.</Alert>
      </Box>
    )
  }

  // Find the currently selected item for rendering
  const activeItem = selectedView?.items.find((i) => i.id === selectedItemId && i.visible)

  // --- Handlers ---
  const handleToggleExpand = (viewId: string) => {
    setExpandedViews((prev) => {
      const next = new Set(prev)
      if (next.has(viewId)) next.delete(viewId)
      else next.add(viewId)
      return next
    })
  }

  const handleCreateView = () => {
    dispatch(createView({ name: newViewName || undefined }))
    setNewViewDialogOpen(false)
    setNewViewName('')
  }

  const handleAddItem = (type: FdtdViewItemType) => {
    if (addItemViewId) {
      dispatch(addItemToView({ viewId: addItemViewId, type }))
      // Auto-expand the view
      setExpandedViews((prev) => new Set(prev).add(addItemViewId))
    }
    setAddItemAnchor(null)
    setAddItemViewId(null)
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ---- Left panel: View tree ---- */}
      <Paper
        variant="outlined"
        sx={{ width: 260, flexShrink: 0, overflow: 'auto', borderRadius: 0 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 1.5, py: 1 }}
        >
          <Typography variant="subtitle2">Views</Typography>
          <Tooltip title="Add view">
            <IconButton size="small" onClick={() => setNewViewDialogOpen(true)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />

        {views.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No views. Click + to create one.
          </Typography>
        ) : (
          <List dense disablePadding>
            {views.map((view) => {
              const isExpanded = expandedViews.has(view.id)
              const isSelected = view.id === selectedViewId
              return (
                <Box key={view.id}>
                  {/* View header */}
                  <ListItemButton
                    selected={isSelected && !selectedItemId}
                    onClick={() => {
                      dispatch(selectView(view.id))
                      dispatch(selectItem(null))
                      handleToggleExpand(view.id)
                    }}
                    sx={{ pl: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {isExpanded ? (
                        <ExpandMore fontSize="small" />
                      ) : (
                        <ChevronRight fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={view.name}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    />
                    <Tooltip title="Add item">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAddItemAnchor(e.currentTarget)
                          setAddItemViewId(view.id)
                        }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete view">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch(deleteView(view.id))
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </ListItemButton>

                  {/* Items */}
                  <Collapse in={isExpanded}>
                    {view.items.map((item) => (
                      <ListItemButton
                        key={item.id}
                        selected={item.id === selectedItemId}
                        onClick={() => {
                          dispatch(selectView(view.id))
                          dispatch(selectItem(item.id))
                        }}
                        sx={{ pl: 5 }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {getIconForType(item.type)}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            noWrap: true,
                            color: item.visible ? 'text.primary' : 'text.disabled',
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch(
                              toggleItemVisibility({ viewId: view.id, itemId: item.id }),
                            )
                          }}
                        >
                          {item.visible ? (
                            <Visibility sx={{ fontSize: 16 }} />
                          ) : (
                            <VisibilityOff sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch(removeItemFromView({ viewId: view.id, itemId: item.id }))
                          }}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </ListItemButton>
                    ))}
                  </Collapse>
                </Box>
              )
            })}
          </List>
        )}
      </Paper>

      {/* ---- Main visualization area ---- */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
        {computeError && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {computeError}
          </Alert>
        )}

        {!activeItem && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography color="text.secondary">
              {views.length === 0
                ? 'Create a view to get started.'
                : selectedView && selectedView.items.length === 0
                  ? 'Add a visualization item to this view.'
                  : 'Select a visible item from the tree to display it.'}
            </Typography>
          </Box>
        )}

        {activeItem && <ViewItemRenderer type={activeItem.type} />}
      </Box>

      {/* ---- Add-item context menu ---- */}
      <Menu
        anchorEl={addItemAnchor}
        open={Boolean(addItemAnchor)}
        onClose={() => {
          setAddItemAnchor(null)
          setAddItemViewId(null)
        }}
      >
        {ITEM_TYPE_META.map((m) => (
          <MenuItem key={m.type} onClick={() => handleAddItem(m.type)}>
            <ListItemIcon>{m.icon}</ListItemIcon>
            <ListItemText>{m.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* ---- New View dialog ---- */}
      <Dialog
        open={newViewDialogOpen}
        onClose={() => setNewViewDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New View</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="View name (optional)"
            fullWidth
            size="small"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateView()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewViewDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateView}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FdtdPostprocessingTab
