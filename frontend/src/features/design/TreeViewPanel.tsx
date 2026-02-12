import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import {
  ExpandMore,
  Visibility,
  VisibilityOff,
  CableOutlined,
  RadioButtonChecked,
  BoltOutlined,
  MemoryOutlined,
  AccountTree,
  Radio,
  AllInclusive,
  LinearScale,
  MoreVert,
  ContentCopy,
  Delete,
  Edit,
  Lock,
  LockOpen,
  GridOn,
  CheckCircle,
} from '@mui/icons-material';
import { DEFAULT_ELEMENT_COLOR } from '@/utils/colors';
import type { Mesh, Source, LumpedElement, AntennaElement } from '@/types/models';

interface TreeNode {
  id: string;
  label: string;
  type: 'element' | 'mesh' | 'edge' | 'node' | 'source' | 'load';
  visible: boolean;
  children?: TreeNode[];
  elementId?: string;
}

interface TreeViewPanelProps {
  // Multi-element support
  elements?: AntennaElement[];
  selectedElementId?: string | null;
  onElementSelect?: (elementId: string) => void;
  onElementDelete?: (elementId: string) => void;
  onElementDuplicate?: (elementId: string) => void;
  onElementRename?: (elementId: string, newName: string) => void;
  onElementLock?: (elementId: string, locked: boolean) => void;
  onElementVisibilityToggle?: (elementId: string, visible: boolean) => void;

  // Mode control
  mode?: 'designer' | 'solver' | 'postprocessing'; // designer: full edit, solver: view-only, postprocessing: view configs

  // Field regions (solver mode only)
  fieldRegions?: Array<{ id: string; name?: string; type: string; shape: string; visible?: boolean }>;
  onFieldSelect?: (fieldId: string) => void;
  selectedFieldId?: string;
  onFieldVisibilityToggle?: (fieldId: string, visible: boolean) => void;
  onFieldDelete?: (fieldId: string) => void;
  onFieldRename?: (fieldId: string, newName: string) => void;
  fieldResults?: Record<string, { computed: boolean; num_points: number }> | null; // Field computation status
  directivityRequested?: boolean;
  onDirectivitySelect?: () => void;
  onDirectivityDelete?: () => void;
  isSolved?: boolean; // Track if design is solved (for outdated warnings)

  // Postprocessing mode (view configurations)
  viewConfigurations?: Array<{
    id: string;
    name: string;
    viewType: '3D' | 'Line';
    items: Array<{
      id: string;
      type: string;
      label?: string;
      visible?: boolean;
    }>;
  }>;
  selectedViewId?: string | null;
  selectedItemId?: string | null;
  onViewSelect?: (viewId: string) => void;
  onViewDelete?: (viewId: string) => void;
  onViewRename?: (viewId: string, newName: string) => void;
  onItemSelect?: (viewId: string, itemId: string) => void;
  onItemDelete?: (viewId: string, itemId: string) => void;
  onItemVisibilityToggle?: (viewId: string, itemId: string) => void;

  // Single mesh support (backward compatibility)
  mesh?: Mesh;
  sources?: Source[];
  lumpedElements?: LumpedElement[];
  antennaType?: string;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string;
}

/**
 * TreeViewPanel - Hierarchical view of mesh elements
 * Shows antenna elements, nodes, edges, sources, and lumped elements
 * Supports both multi-element and single mesh modes
 */
function TreeViewPanel({
  elements,
  selectedElementId,
  onElementSelect,
  onElementDelete,
  onElementDuplicate,
  onElementRename,
  onElementLock,
  onElementVisibilityToggle,
  mode = 'designer',
  fieldRegions,
  onFieldSelect,
  selectedFieldId,
  onFieldVisibilityToggle,
  onFieldDelete,
  onFieldRename,
  fieldResults,
  directivityRequested = false,
  onDirectivitySelect,
  onDirectivityDelete,
  isSolved = true,
  viewConfigurations = [],
  selectedViewId,
  selectedItemId,
  onViewSelect,
  onViewDelete,
  onViewRename,
  onItemSelect,
  onItemDelete,
  onItemVisibilityToggle,
  mesh,
  sources = [],
  lumpedElements = [],
  antennaType = 'Antenna',
  onSelectNode,
  selectedNodeId,
}: TreeViewPanelProps) {
  // Element context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    elementId: string;
  } | null>(null);

  // Field context menu state
  const [fieldContextMenu, setFieldContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    fieldId: string;
  } | null>(null);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
  const [newElementName, setNewElementName] = useState('');

  // Field rename dialog state
  const [fieldRenameDialogOpen, setFieldRenameDialogOpen] = useState(false);
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  // Build tree data from elements or single mesh
  const treeData = useMemo<TreeNode[]>(() => {
    console.log('[TreeViewPanel] Building tree from elements:', elements?.map(e => ({ id: e.id, name: e.name })));

    const result: TreeNode[] = [];

    if (elements && elements.length > 0) {
      // Multi-element mode
      elements.forEach((element) => {
        const elementNode: TreeNode = {
          id: element.id,
          elementId: element.id,
          label: element.name,
          type: 'element',
          visible: element.visible,
          children: [],
        };

        // Add sources as direct children of element
        if (element.sources && element.sources.length > 0) {
          element.sources.forEach((source, idx) => {
            elementNode.children!.push({
              id: `${element.id}_source_${idx}`,
              elementId: element.id,
              label: `${source.type.toUpperCase()} Source`,
              type: 'source',
              visible: element.visible,
            });
          });
        }

        // Add lumped elements as direct children of element
        if (element.lumped_elements && element.lumped_elements.length > 0) {
          element.lumped_elements.forEach((le, idx) => {
            elementNode.children!.push({
              id: `${element.id}_load_${idx}`,
              elementId: element.id,
              label: `${le.type.charAt(0).toUpperCase() + le.type.slice(1)}`,
              type: 'load',
              visible: element.visible,
            });
          });
        }

        // Add mesh structure for each element
        if (element.mesh) {
          const meshNode: TreeNode = {
            id: `${element.id}_mesh`,
            elementId: element.id,
            label: 'Mesh',
            type: 'mesh',
            visible: element.visible,
            children: [],
          };

          // Add edges
          if (element.mesh.edges && element.mesh.edges.length > 0) {
            element.mesh.edges.forEach((_, idx) => {
              meshNode.children!.push({
                id: `${element.id}_edge_${idx}`,
                elementId: element.id,
                label: `Edge ${idx + 1}`,
                type: 'edge',
                visible: element.visible,
              });
            });
          }

          elementNode.children!.push(meshNode);
        }

        result.push(elementNode);
      });
    } else if (mesh) {
      // Single mesh mode (backward compatibility)
      const meshNode: TreeNode = {
        id: 'mesh',
        label: antennaType,
        type: 'mesh',
        visible: true,
        children: [],
      };

      // Add edges
      if (mesh.edges && mesh.edges.length > 0) {
        mesh.edges.forEach((_, idx) => {
          meshNode.children!.push({
            id: `edge_${idx}`,
            label: `Edge ${idx + 1}`,
            type: 'edge',
            visible: true,
          });
        });
      }

      result.push(meshNode);

      // Add sources
      if (sources.length > 0) {
        sources.forEach((source, idx) => {
          result.push({
            id: `source_${idx}`,
            label: `${source.type.toUpperCase()} Source`,
            type: 'source',
            visible: true,
          });
        });
      }

      // Add lumped elements
      if (lumpedElements.length > 0) {
        lumpedElements.forEach((element, idx) => {
          result.push({
            id: `lumped_${idx}`,
            label: `${element.type.charAt(0).toUpperCase() + element.type.slice(1)}`,
            type: 'load',
            visible: true,
          });
        });
      }
    }

    return result;
  }, [elements, mesh, sources, lumpedElements, antennaType]);

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      elementId,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRenameClick = (elementId: string) => {
    const element = elements?.find(el => el.id === elementId);
    if (element) {
      setRenamingElementId(elementId);
      setNewElementName(element.name);
      setRenameDialogOpen(true);
      handleCloseContextMenu();
    }
  };

  const handleRenameConfirm = () => {
    if (renamingElementId && newElementName.trim()) {
      onElementRename?.(renamingElementId, newElementName.trim());
      setRenameDialogOpen(false);
      setRenamingElementId(null);
    }
  };

  const handleDuplicateClick = (elementId: string) => {
    onElementDuplicate?.(elementId);
    handleCloseContextMenu();
  };

  const handleDeleteClick = (elementId: string) => {
    if (window.confirm('Are you sure you want to delete this element?')) {
      onElementDelete?.(elementId);
      handleCloseContextMenu();
    }
  };

  const handleLockClick = (elementId: string, currentLocked: boolean) => {
    onElementLock?.(elementId, !currentLocked);
    handleCloseContextMenu();
  };

  const [visibilityState, setVisibilityState] = useState<Record<string, boolean>>({});

  const toggleVisibility = (nodeId: string) => {
    setVisibilityState((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const isVisible = (nodeId: string): boolean => {
    return visibilityState[nodeId] ?? true;
  };

  const getIcon = (type: string, elementType?: string) => {
    switch (type) {
      case 'element':
        // Different icons for different antenna types
        switch (elementType) {
          case 'dipole':
            return <LinearScale />;
          case 'loop':
            return <Radio />;
          case 'helix':
            return <AllInclusive />;
          case 'rod':
            return <LinearScale />;
          default:
            return <AccountTree />;
        }
      case 'mesh':
        return <CableOutlined />;
      case 'edge':
        return <CableOutlined fontSize="small" />;
      case 'node':
        return <RadioButtonChecked fontSize="small" />;
      case 'source':
        return <BoltOutlined color="error" fontSize="small" />;
      case 'load':
        return <MemoryOutlined color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = (node.type === 'element' && selectedElementId === node.id) ||
                      (node.type !== 'element' && selectedNodeId === node.id);
    // For element nodes, use Redux visible state; for others use local state
    const visible = node.type === 'element' ? (node.visible ?? true) : isVisible(node.id);
    const element = elements?.find(el => el.id === node.elementId && node.type === 'element');

    if (hasChildren) {
      return (
        <Accordion
          key={node.id}
          disableGutters
          elevation={0}
          sx={{
            '&:before': { display: 'none' },
            bgcolor: 'transparent',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMore />}
            onClick={(e) => {
              // Only select if not clicking on expand icon or action buttons
              const target = e.target as HTMLElement;
              if (!target.closest('button') && !target.closest('.MuiAccordionSummary-expandIconWrapper')) {
                console.log('AccordionSummary clicked:', node.type, node.id);
                if (node.type === 'element') {
                  onElementSelect?.(node.id);
                } else {
                  onSelectNode?.(node.id);
                }
              }
            }}
            sx={{
              minHeight: 40,
              pl: level * 2,
              '&.Mui-expanded': { minHeight: 40 },
              bgcolor: isSelected ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
              {/* Color indicator for elements */}
              {node.type === 'element' && node.elementId && (
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: elements?.find(el => el.id === node.elementId)?.color || DEFAULT_ELEMENT_COLOR,
                    border: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                  }}
                />
              )}
              <ListItemIcon sx={{ minWidth: 32 }}>
                {getIcon(node.type, node.elementId ? elements?.find(el => el.id === node.elementId)?.type : undefined)}
              </ListItemIcon>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {node.label}
              </Typography>
              <Tooltip title={visible ? 'Hide' : 'Show'}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.type === 'element') {
                      onElementVisibilityToggle?.(node.id, !visible);
                    } else {
                      toggleVisibility(node.id);
                    }
                  }}
                  sx={{ p: 0.5 }}
                >
                  {visible ? (
                    <Visibility fontSize="small" />
                  ) : (
                    <VisibilityOff fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              {/* Element lock button - only in designer mode */}
              {mode === 'designer' && node.type === 'element' && element && (
                <Tooltip title={element.locked ? 'Unlock' : 'Lock'}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLockClick(element.id, element.locked);
                    }}
                    sx={{ p: 0.5 }}
                  >
                    {element.locked ? (
                      <Lock fontSize="small" />
                    ) : (
                      <LockOpen fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              {/* Element context menu - only in designer mode */}
              {mode === 'designer' && node.type === 'element' && (
                <Tooltip title="More actions">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e, node.id);
                    }}
                    sx={{ p: 0.5 }}
                  >
                    <MoreVert fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {node.children?.map((child) => renderTreeNode(child, level + 1))}
          </AccordionDetails>
        </Accordion>
      );
    }

    return (
      <ListItem
        key={node.id}
        disablePadding
        secondaryAction={
          <Tooltip title={visible ? 'Hide' : 'Show'}>
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                // If it's an element node, dispatch to Redux; otherwise use local state
                if (node.elementId && node.type === 'element') {
                  onElementVisibilityToggle?.(node.elementId, !visible);
                } else {
                  toggleVisibility(node.id);
                }
              }}
              sx={{ p: 0.5 }}
            >
              {visible ? (
                <Visibility fontSize="small" />
              ) : (
                <VisibilityOff fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        }
      >
        <ListItemButton
          selected={isSelected}
          onClick={() => {
            console.log('TreeView clicked:', node.type, node.id, node);
            if (node.type === 'element') {
              console.log('Calling onElementSelect with:', node.id);
              onElementSelect?.(node.id);
            } else {
              console.log('Calling onSelectNode with:', node.id);
              onSelectNode?.(node.id);
            }
          }}
          sx={{ pl: level * 2 + 2 }}
        >
          {/* Color indicator for elements */}
          {node.type === 'element' && node.elementId && (
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: elements?.find(el => el.id === node.elementId)?.color || DEFAULT_ELEMENT_COLOR,
                border: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
                mr: 1,
              }}
            />
          )}
          <ListItemIcon sx={{ minWidth: 32 }}>
            {getIcon(node.type, node.elementId ? elements?.find(el => el.id === node.elementId)?.type : undefined)}
          </ListItemIcon>
          <ListItemText
            primary={node.label}
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  return (
    <Box sx={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      margin: 0,
      padding: 0,
      bgcolor: 'background.paper',
    }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Structure
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Antenna mesh hierarchy
        </Typography>
      </Box>

      {/* Tree Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {treeData.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No antenna loaded</Typography>
          </Box>
        ) : (
          <List disablePadding key={elements?.map(e => e.id).join(',') || 'single-mesh'}>
            {treeData.map((node) => renderTreeNode(node, 0))}
          </List>
        )}

        {/* Requested Quantities Section (Solver Mode) */}
        {mode === 'solver' && (
          <>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderTop: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default',
                mt: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Requested Quantities
              </Typography>
              {fieldResults && Object.keys(fieldResults).length > 0 && (() => {
                const anyFieldOutdated = Object.values(fieldResults).some(r => r && !r.computed);
                const isOutdated = !isSolved || anyFieldOutdated;
                return isOutdated ? (
                  <Chip
                    label="Outdated"
                    size="small"
                    color="warning"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                    title={anyFieldOutdated && isSolved
                      ? 'Field definitions changed. Re-run postprocessing.'
                      : 'Design changed. Re-run solver and postprocessing.'}
                  />
                ) : null;
              })()}
            </Box>
            <List disablePadding>
              <ListItem disablePadding data-testid="currents-item">
                <ListItemButton disabled sx={{ pl: 3, opacity: 0.8 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Currents & Voltages"
                    secondary="Always included"
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Lock fontSize="small" color="disabled" />
                </ListItemButton>
              </ListItem>

              {directivityRequested && (
                <ListItem
                  disablePadding
                  data-testid="directivity-item"
                  secondaryAction={
                    <Tooltip title="Remove directivity">
                      <IconButton
                        size="small"
                        aria-label="Delete directivity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDirectivityDelete?.();
                        }}
                        sx={{ p: 0.5 }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemButton
                    selected={selectedFieldId === 'directivity'}
                    onClick={() => {
                      onDirectivitySelect?.();
                      onFieldSelect?.('directivity');
                    }}
                    sx={{ pl: 3 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {fieldResults?.['directivity']?.computed ? (
                        <CheckCircle fontSize="small" sx={{ color: 'success.main' }} />
                      ) : (
                        <Radio fontSize="small" color="secondary" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary="Directivity"
                      secondary={fieldResults?.['directivity']?.computed ? "✓ Far-field pattern" : "Far-field pattern"}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              )}

              {fieldRegions?.map((field) => {
                const fieldVisible = field.visible ?? true;
                const isComputed = fieldResults?.[field.id]?.computed ?? false;
                const numPoints = fieldResults?.[field.id]?.num_points;

                return (
                  <ListItem
                    key={field.id}
                    disablePadding
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {/* Computed status indicator */}
                        {isComputed && (
                          <Tooltip title={`${numPoints} points computed`}>
                            <CheckCircle fontSize="small" sx={{ color: 'success.main', mr: 0.5 }} />
                          </Tooltip>
                        )}
                        {/* Visibility toggle */}
                        <Tooltip title={fieldVisible ? 'Hide' : 'Show'}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFieldVisibilityToggle?.(field.id, !fieldVisible);
                            }}
                            sx={{ p: 0.5 }}
                          >
                            {fieldVisible ? (
                              <Visibility fontSize="small" />
                            ) : (
                              <VisibilityOff fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        {/* Context menu */}
                        <Tooltip title="More actions">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFieldContextMenu({
                                mouseX: e.clientX - 2,
                                mouseY: e.clientY - 4,
                                fieldId: field.id,
                              });
                            }}
                            sx={{ p: 0.5 }}
                          >
                            <MoreVert fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    }
                  >
                    <ListItemButton
                      selected={field.id === selectedFieldId}
                      onClick={() => onFieldSelect?.(field.id)}
                      sx={{ pl: 3 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <GridOn fontSize="small" sx={{ color: isComputed ? 'success.main' : 'info.main' }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={field.name || `${field.type} ${field.shape}`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { fontWeight: field.id === selectedFieldId ? 600 : 400 },
                        }}
                        secondary={`${field.type} - ${field.shape}${isComputed ? ' ✓' : ''}`}
                        secondaryTypographyProps={{
                          variant: 'caption',
                          sx: { color: isComputed ? 'success.main' : 'text.secondary' },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}

              {(!fieldRegions || fieldRegions.length === 0) && !directivityRequested && (
                <Box sx={{ px: 3, py: 2, color: 'text.secondary' }}>
                  <Typography variant="body2">No additional fields requested yet</Typography>
                </Box>
              )}
            </List>
          </>
        )}

        {/* Postprocessing Mode - View Configurations */}
        {mode === 'postprocessing' && (
          <>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderTop: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Result Views
              </Typography>
            </Box>
            {viewConfigurations.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No result views yet</Typography>
                <Typography variant="caption">Click "Add View" to create one</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {viewConfigurations.map((view) => (
                  <Accordion
                    key={view.id}
                    disableGutters
                    elevation={0}
                    sx={{
                      '&:before': { display: 'none' },
                      bgcolor: view.id === selectedViewId ? 'action.selected' : 'transparent',
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMore />}
                      onClick={() => onViewSelect?.(view.id)}
                      sx={{
                        minHeight: 48,
                        '& .MuiAccordionSummary-content': {
                          my: 0.5,
                          alignItems: 'center',
                          gap: 1,
                        },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: view.id === selectedViewId ? 600 : 400, flex: 1 }}>
                        {view.name}
                      </Typography>
                      <Chip
                        label={view.viewType}
                        size="small"
                        variant="outlined"
                        color={view.viewType === '3D' ? 'primary' : 'secondary'}
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                      {view.items.length === 0 ? (
                        <Box sx={{ px: 3, py: 2, color: 'text.secondary' }}>
                          <Typography variant="caption">No items in this view</Typography>
                        </Box>
                      ) : (
                        <List disablePadding>
                          {view.items.map((item) => (
                            <ListItem
                              key={item.id}
                              disablePadding
                              secondaryAction={
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                  <Tooltip title={item.visible === false ? 'Show' : 'Hide'}>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onItemVisibilityToggle?.(view.id, item.id);
                                      }}
                                      sx={{ p: 0.5 }}
                                    >
                                      {item.visible === false ? (
                                        <VisibilityOff fontSize="small" />
                                      ) : (
                                        <Visibility fontSize="small" />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove from view">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onItemDelete?.(view.id, item.id);
                                      }}
                                      sx={{ p: 0.5 }}
                                    >
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              }
                            >
                              <ListItemButton
                                selected={item.id === selectedItemId}
                                onClick={() => onItemSelect?.(view.id, item.id)}
                                sx={{ pl: 5, pr: 10 }}
                              >
                                <ListItemText
                                  primary={item.label || item.type}
                                  primaryTypographyProps={{
                                    variant: 'body2',
                                    sx: {
                                      fontWeight: item.id === selectedItemId ? 600 : 400,
                                      opacity: item.visible === false ? 0.5 : 1,
                                    },
                                  }}
                                  secondary={item.type}
                                  secondaryTypographyProps={{ variant: 'caption' }}
                                />
                              </ListItemButton>
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </List>
            )}
          </>
        )}
      </Box>

      {/* Footer Stats */}
      <Box
        sx={{
          p: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {mesh && (
          <>
            <Chip label={`${mesh.edges.length} Edges`} size="small" variant="outlined" />
            <Chip label={`${mesh.nodes.length} Nodes`} size="small" variant="outlined" />
            {sources.length > 0 && (
              <Chip
                label={`${sources.length} Source${sources.length > 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
                color="error"
              />
            )}
            {lumpedElements.length > 0 && (
              <Chip
                label={`${lumpedElements.length} Element${lumpedElements.length > 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
                color="warning"
              />
            )}
          </>
        )}
      </Box>

      {/* Context Menu for Element Actions */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        <MenuItem
          onClick={() => contextMenu && handleRenameClick(contextMenu.elementId)}
          sx={{ gap: 1 }}
        >
          <Edit fontSize="small" />
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => contextMenu && handleDuplicateClick(contextMenu.elementId)}
          sx={{ gap: 1 }}
        >
          <ContentCopy fontSize="small" />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => contextMenu && handleDeleteClick(contextMenu.elementId)}
          sx={{ gap: 1, color: 'error.main' }}
        >
          <Delete fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Rename Element Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename Element</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label="Element Name"
            value={newElementName}
            onChange={(e) => setNewElementName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleRenameConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRenameConfirm} variant="contained" disabled={!newElementName.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu for Field Actions */}
      <Menu
        open={fieldContextMenu !== null}
        onClose={() => setFieldContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          fieldContextMenu ? { top: fieldContextMenu.mouseY, left: fieldContextMenu.mouseX } : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (fieldContextMenu) {
              const field = fieldRegions?.find(f => f.id === fieldContextMenu.fieldId);
              setRenamingFieldId(fieldContextMenu.fieldId);
              setNewFieldName(field?.name || `${field?.type} ${field?.shape}`);
              setFieldRenameDialogOpen(true);
              setFieldContextMenu(null);
            }
          }}
          sx={{ gap: 1 }}
        >
          <Edit fontSize="small" />
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (fieldContextMenu) {
              onFieldDelete?.(fieldContextMenu.fieldId);
              setFieldContextMenu(null);
            }
          }}
          sx={{ gap: 1, color: 'error.main' }}
        >
          <Delete fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Rename Field Dialog */}
      <Dialog open={fieldRenameDialogOpen} onClose={() => setFieldRenameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename Field Region</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label="Field Name"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newFieldName.trim() && renamingFieldId) {
                onFieldRename?.(renamingFieldId, newFieldName.trim());
                setFieldRenameDialogOpen(false);
                setRenamingFieldId(null);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldRenameDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (newFieldName.trim() && renamingFieldId) {
                onFieldRename?.(renamingFieldId, newFieldName.trim());
                setFieldRenameDialogOpen(false);
                setRenamingFieldId(null);
              }
            }}
            variant="contained"
            disabled={!newFieldName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TreeViewPanel;
