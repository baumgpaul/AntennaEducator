import { useState } from 'react';
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
} from '@mui/icons-material';

interface TreeNode {
  id: string;
  label: string;
  type: 'mesh' | 'edge' | 'node' | 'source' | 'load';
  visible: boolean;
  children?: TreeNode[];
}

interface TreeViewPanelProps {
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string;
}

/**
 * TreeViewPanel - Hierarchical view of mesh elements
 * Shows nodes, edges, sources, and lumped elements
 */
function TreeViewPanel({ onSelectNode, selectedNodeId }: TreeViewPanelProps) {
  // Mock data - will be replaced with actual mesh data from Redux
  const [treeData, setTreeData] = useState<TreeNode[]>([
    {
      id: 'mesh-1',
      label: 'Dipole Antenna',
      type: 'mesh',
      visible: true,
      children: [
        {
          id: 'edges',
          label: 'Edges (10)',
          type: 'edge',
          visible: true,
          children: Array.from({ length: 10 }, (_, i) => ({
            id: `edge-${i}`,
            label: `Edge ${i + 1}`,
            type: 'edge' as const,
            visible: true,
          })),
        },
        {
          id: 'nodes',
          label: 'Nodes (11)',
          type: 'node',
          visible: true,
          children: Array.from({ length: 11 }, (_, i) => ({
            id: `node-${i}`,
            label: `Node ${i + 1}`,
            type: 'node' as const,
            visible: true,
          })),
        },
        {
          id: 'sources',
          label: 'Sources (1)',
          type: 'source',
          visible: true,
          children: [
            {
              id: 'source-1',
              label: 'Voltage Source',
              type: 'source' as const,
              visible: true,
            },
          ],
        },
      ],
    },
  ]);

  const toggleVisibility = (nodeId: string) => {
    const updateVisibility = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, visible: !node.visible };
        }
        if (node.children) {
          return { ...node, children: updateVisibility(node.children) };
        }
        return node;
      });
    };
    setTreeData(updateVisibility(treeData));
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
        return <RadioButtonChecked color="error" fontSize="small" />;
      case 'load':
        return <RadioButtonChecked color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNodeId === node.id;

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
              <Tooltip title={node.visible ? 'Hide' : 'Show'}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(node.id);
                  }}
                  sx={{ p: 0.5 }}
                >
                  {node.visible ? (
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
          <Tooltip title={node.visible ? 'Hide' : 'Show'}>
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                toggleVisibility(node.id);
              }}
              sx={{ p: 0.5 }}
            >
              {node.visible ? (
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        <Chip label="10 Edges" size="small" variant="outlined" />
        <Chip label="11 Nodes" size="small" variant="outlined" />
        <Chip label="1 Source" size="small" variant="outlined" color="error" />
      </Box>
    </Box>
  );
}

export default TreeViewPanel;
