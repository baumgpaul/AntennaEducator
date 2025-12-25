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
} from '@mui/icons-material';
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
  mesh,
  sources = [],
  lumpedElements = [],
  antennaType = 'Antenna',
  onSelectNode,
  selectedNodeId,
}: TreeViewPanelProps) {
  // Build tree data from elements or single mesh
  const treeData = useMemo<TreeNode[]>(() => {
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
      
      // Add global sources and lumped elements if any
      if (sources.length > 0 || lumpedElements.length > 0) {
        const globalNode: TreeNode = {
          id: 'global',
          label: 'Global Elements',
          type: 'mesh',
          visible: true,
          children: [],
        };

        sources.forEach((source, idx) => {
          globalNode.children!.push({
            id: `source_${idx}`,
            label: `${source.type.toUpperCase()} Source`,
            type: 'source',
            visible: true,
          });
        });

        lumpedElements.forEach((element, idx) => {
          globalNode.children!.push({
            id: `lumped_${idx}`,
            label: `${element.type.charAt(0).toUpperCase() + element.type.slice(1)}`,
            type: 'load',
            visible: true,
          });
        });

        if (globalNode.children!.length > 0) {
          result.push(globalNode);
        }
      }
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
    const visible = isVisible(node.id);

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
            sx={{
              minHeight: 40,
              pl: level * 2,
              '&.Mui-expanded': { minHeight: 40 },
              bgcolor: isSelected ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
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
                    toggleVisibility(node.id);
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
                toggleVisibility(node.id);
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
            if (node.type === 'element') {
              onElementSelect?.(node.id);
            } else {
              onSelectNode?.(node.id);
            }
          }}
          sx={{ pl: level * 2 + 2 }}
        >
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
          <List disablePadding>{treeData.map((node) => renderTreeNode(node, 0))}</List>
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
    </Box>
  );
}

export default TreeViewPanel;
