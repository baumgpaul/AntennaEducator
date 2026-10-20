import { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';

export interface ViewType<T extends string = string> {
  type: T;
  label: string;
  icon: JSX.Element;
}

export interface WorkspaceView<T extends string = string> {
  id: string;
  name: string;
  type: T;
}

interface Props<T extends string, V extends WorkspaceView<T>> {
  viewTypes: ViewType<T>[];
  views: V[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: T) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  renderView: (view: V) => React.ReactNode;
  /** Settings of the selected view (right panel), or null for none */
  renderProperties?: (view: V) => React.ReactNode | null;
  /** Extra toolbar content (exports …) */
  actions?: React.ReactNode;
}

/**
 * Results as views — the layout of the antenna Postprocessing tab, for any
 * method: add views by type, pick one on the left, see it in the middle, set
 * it up on the right. Each method supplies its view types and renderers.
 */
function ResultsWorkspace<T extends string, V extends WorkspaceView<T>>({
  viewTypes,
  views,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  renderView,
  renderProperties,
  actions,
}: Props<T, V>) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const selected = views.find((v) => v.id === selectedId) ?? views[0] ?? null;
  const properties = selected && renderProperties ? renderProperties(selected) : null;
  const iconOf = (t: T) => viewTypes.find((x) => x.type === t)?.icon;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 1 }}>
      <Paper variant="outlined" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          Add view
        </Typography>
        <ButtonGroup size="small" variant="outlined">
          {viewTypes.map((vt) => (
            <Button key={vt.type} startIcon={vt.icon} onClick={() => onAdd(vt.type)}>
              {vt.label}
            </Button>
          ))}
        </ButtonGroup>
        <Box sx={{ flex: 1 }} />
        {actions}
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 1 }}>
        <Paper variant="outlined" sx={{ width: 200, flexShrink: 0, overflow: 'auto' }}>
          <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
            Result views
          </Typography>
          {views.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No views yet: add one above.
            </Typography>
          )}
          <List dense disablePadding>
            {views.map((v) => (
              <ListItemButton key={v.id} selected={v.id === selected?.id} onClick={() => onSelect(v.id)}>
                <ListItemIcon sx={{ minWidth: 32 }}>{iconOf(v.type)}</ListItemIcon>
                {renaming === v.id ? (
                  <TextField
                    size="small"
                    autoFocus
                    defaultValue={v.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      if (e.target.value.trim()) onRename(v.id, e.target.value.trim());
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <ListItemText primary={v.name} />
                )}
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    aria-label={`Rename ${v.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenaming(v.id);
                    }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    aria-label={`Delete ${v.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(v.id);
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, p: 1.5, overflow: 'auto' }}>
          {selected ? (
            renderView(selected)
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Add color="disabled" />
              <Typography color="text.secondary">Add a view to look at the results.</Typography>
            </Box>
          )}
        </Paper>

        {properties && (
          <Paper variant="outlined" sx={{ width: 230, flexShrink: 0, p: 2, overflow: 'auto' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              View properties
            </Typography>
            {properties}
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default ResultsWorkspace;
