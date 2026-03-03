import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Collapse,
  Typography,
  Tooltip,
  Menu,
  MenuItem,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen,
  ExpandLess,
  ExpandMore,
  MoreVert,
  CreateNewFolder,
  Edit,
  Delete,
  DriveFileMove,
} from '@mui/icons-material';
import { useState, useCallback } from 'react';
import type { FolderTreeNode } from '@/store/foldersSlice';

interface FolderTreeProps {
  tree: FolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder?: (parentFolderId: string | null) => void;
  onRenameFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
  onMoveFolder?: (folder: FolderTreeNode) => void;
  readOnly?: boolean;
  rootLabel?: string;
}

/**
 * FolderTree — Renders a collapsible folder tree with context menu actions.
 */
function FolderTree({
  tree,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  readOnly = false,
  rootLabel = 'My Projects',
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuFolder, setMenuFolder] = useState<FolderTreeNode | null>(null);

  const toggleExpand = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>, folder: FolderTreeNode) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuFolder(folder);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuFolder(null);
  };

  const renderNode = (node: FolderTreeNode, depth: number) => {
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <Box key={node.id}>
        <ListItemButton
          selected={isSelected}
          onClick={() => onSelectFolder(node.id)}
          sx={{ pl: 2 + depth * 2 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            {isExpanded ? <FolderOpen fontSize="small" /> : <FolderIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText
            primary={node.name}
            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
          />
          {hasChildren && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              sx={{ mr: readOnly ? 0 : 3 }}
            >
              {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
          {!readOnly && (
            <ListItemSecondaryAction>
              <IconButton size="small" edge="end" onClick={(e) => handleContextMenu(e, node)}>
                <MoreVert fontSize="small" />
              </IconButton>
            </ListItemSecondaryAction>
          )}
        </ListItemButton>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <List dense disablePadding>
        {/* Root level */}
        <ListItemButton
          selected={selectedFolderId === null}
          onClick={() => onSelectFolder(null)}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={rootLabel}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 'bold' }}
          />
          {!readOnly && onCreateFolder && (
            <Tooltip title="New Folder">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFolder(null);
                }}
              >
                <CreateNewFolder fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </ListItemButton>

        {/* Folder tree */}
        {tree.map((node) => renderNode(node, 1))}

        {tree.length === 0 && (
          <Box sx={{ pl: 4, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              No folders yet
            </Typography>
          </Box>
        )}
      </List>

      {/* Context menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {onCreateFolder && (
          <MenuItem
            onClick={() => {
              onCreateFolder(menuFolder?.id ?? null);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <CreateNewFolder fontSize="small" />
            </ListItemIcon>
            New Subfolder
          </MenuItem>
        )}
        {onRenameFolder && menuFolder && (
          <MenuItem
            onClick={() => {
              onRenameFolder(menuFolder);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <Edit fontSize="small" />
            </ListItemIcon>
            Rename
          </MenuItem>
        )}
        {onMoveFolder && menuFolder && (
          <MenuItem
            onClick={() => {
              onMoveFolder(menuFolder);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DriveFileMove fontSize="small" />
            </ListItemIcon>
            Move
          </MenuItem>
        )}
        {onDeleteFolder && menuFolder && (
          <MenuItem
            onClick={() => {
              onDeleteFolder(menuFolder);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <Delete fontSize="small" />
            </ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

export default FolderTree;
