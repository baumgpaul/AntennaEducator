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
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import { PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';

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
  /** More ribbon groups (exports …) */
  actions?: React.ReactNode;
  /** Alerts above the view (out-of-date results, errors) */
  notes?: React.ReactNode;
}

/**
 * Results as views — the layout of the antenna Postprocessing tab, for any
 * method: add views by type in the ribbon, pick one on the left, see it in
 * the middle (as large as possible), set it up on the right.
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
  notes,
}: Props<T, V>) {
  const [renaming, setRenaming] = useState<string | null>(null);
  // narrow screens start with the view itself; the properties open with one click
  const wide = useMediaQuery('(min-width:1600px)', { noSsr: true });
  const [propertiesOpen, setPropertiesOpen] = useState(wide);
  const selected = views.find((v) => v.id === selectedId) ?? views[0] ?? null;
  const properties = selected && renderProperties ? renderProperties(selected) : null;
  const iconOf = (t: T) => viewTypes.find((x) => x.type === t)?.icon;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Add view">
            <ButtonGroup size="small" variant="outlined">
              {viewTypes.map((vt) => (
                <Button key={vt.type} startIcon={vt.icon} onClick={() => onAdd(vt.type)}>
                  {vt.label}
                </Button>
              ))}
            </ButtonGroup>
          </RibbonGroup>
          {actions}
        </Ribbon>
      }
      left={
        <PanelSection title="Result views" dense>
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
        </PanelSection>
      }
      right={properties}
      rightTitle="View properties"
      rightOpen={propertiesOpen}
      onRightToggle={() => setPropertiesOpen((o) => !o)}
      notes={notes}
    >
      {selected ? (
        renderView(selected)
      ) : (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Add color="disabled" />
          <Typography color="text.secondary">Add a view to look at the results.</Typography>
        </Box>
      )}
    </Workspace>
  );
}

export default ResultsWorkspace;
