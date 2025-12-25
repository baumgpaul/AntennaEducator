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
} from '@mui/icons-material';
import type { Mesh, Source, LumpedElement } from '@/types/models';

interface TreeNode {
  id: string;
  label: string;
  type: 'mesh' | 'edge' | 'node' | 'source' | 'load';
  visible: boolean;
  children?: TreeNode[];
}

interface TreeViewPanelProps {
  mesh?: Mesh;
  sources?: Source[];
  lumpedElements?: LumpedElement[];
  antennaType?: string;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string;
}

/**
 * TreeViewPanel - Hierarchical view of mesh elements
 * Shows nodes, edges, sources, and lumped elements from real mesh data
 */
function TreeViewPanel({
  mesh,
  sources = [],
  lumpedElements = [],
  antennaType = 'Antenna',
  onSelectNode,
  selectedNodeId,
}: TreeViewPanelProps) {
  // Build tree data from actual mesh
  const treeData = useMemo<TreeNode[]>(() => {
    if (!mesh) return [];

    const children: TreeNode[] = [];

    // Add edges section
    if (mesh.edges.length > 0) {
      children.push({
        id: 'edges',
        label: `Edges (${mesh.edges.length})`,
        type: 'edge',
        visible: true,
        children: mesh.edges.map((edge, i) => ({
          id: `edge-${i}`,
          label: `Edge ${i + 1} [${edge[0]} → ${edge[1]}]`,
          type: 'edge' as const,
          visible: true,
        })),
      });
    }

    // Add nodes section
    if (mesh.nodes.length > 0) {
      children.push({
        id: 'nodes',
        label: `Nodes (${mesh.nodes.length})`,
        type: 'node',
        visible: true,
        children: mesh.nodes.map((node, i) => ({
          id: `node-${i}`,
          label: `Node ${i} (${node[0].toFixed(3)}, ${node[1].toFixed(3)}, ${node[2].toFixed(3)})`,
          type: 'node' as const,
          visible: true,
        })),
      });
    }

    // Add sources section
    if (sources.length > 0) {
      children.push({
        id: 'sources',
        label: `Sources (${sources.length})`,
        type: 'source',
        visible: true,
        children: sources.map((source, i) => ({
          id: `source-${i}`,
          label: source.tag || `${source.type} Source ${i + 1}`,
          type: 'source' as const,
          visible: true,
        })),
      });
    }

    // Add lumped elements section
    if (lumpedElements.length > 0) {
      children.push({
        id: 'lumped',
        label: `Lumped Elements (${lumpedElements.length})`,
        type: 'load',
        visible: true,
        children: lumpedElements.map((element, i) => ({
          id: `lumped-${i}`,
          label: element.tag || `${element.type} ${i + 1}`,
          type: 'load' as const,
          visible: true,
        })),
      });
    }

    return [
      {
        id: 'mesh-1',
        label: antennaType,
        type: 'mesh',
        visible: true,
        children,
      },
    ];
  }, [mesh, sources, lumpedElements, antennaType]);

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

  const getIcon = (type: string) => {
    switch (type) {
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
    const isSelected = selectedNodeId === node.id;
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
              <ListItemIcon sx={{ minWidth: 32 }}>{getIcon(node.type)}</ListItemIcon>
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
          onClick={() => onSelectNode?.(node.id)}
          sx={{ pl: level * 2 + 2 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>{getIcon(node.type)}</ListItemIcon>
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
