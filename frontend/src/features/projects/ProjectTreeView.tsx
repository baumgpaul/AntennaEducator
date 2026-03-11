import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Collapse,
  Typography,
  Chip,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen,
  Description as ProjectIcon,
  ExpandLess,
  ExpandMore,
  MoreVert,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileCopy as CopyIcon,
  OpenInNew as OpenIcon,
  ContentCopy,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FolderTreeNode } from '@/store/foldersSlice';
import type { Project } from '@/types/models';

interface ProjectTreeViewProps {
  folderTree: FolderTreeNode[];
  projects: Project[];
  currentFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (project: Project) => void;
  onDuplicateProject?: (project: Project) => void;
  onCopyProject?: (project: Project) => void;
  copyOnly?: boolean;
}

function ProjectTreeView({
  folderTree,
  projects,
  currentFolderId,
  onSelectFolder,
  onEditProject,
  onDeleteProject,
  onDuplicateProject,
  onCopyProject,
  copyOnly = false,
}: ProjectTreeViewProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuProject, setMenuProject] = useState<Project | null>(null);

  const toggleExpand = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleOpenProject = (project: Project) => {
    if (copyOnly) return;
    navigate(`/project/${project.id}/design`);
  };

  const openMenu = (event: React.MouseEvent<HTMLElement>, project: Project) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuProject(project);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuProject(null);
  };

  const getProjectsInFolder = (folderId: string | null) => {
    return projects.filter((p) =>
      folderId === null ? !p.folder_id : p.folder_id === folderId,
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderProjectItem = (project: Project, depth: number) => (
    <ListItemButton
      key={String(project.id)}
      onClick={() => handleOpenProject(project)}
      sx={{
        pl: 2 + depth * 2,
        cursor: copyOnly ? 'default' : 'pointer',
        opacity: copyOnly ? 0.85 : 1,
        borderLeft: copyOnly ? '3px solid' : 'none',
        borderColor: copyOnly ? 'warning.main' : 'transparent',
      }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>
        {copyOnly ? (
          <LockIcon fontSize="small" color="warning" />
        ) : (
          <ProjectIcon fontSize="small" color="primary" />
        )}
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" noWrap sx={{ flex: 1 }}>
              {project.name}
            </Typography>
            {copyOnly && (
              <Chip label="Copy only" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
            )}
          </Box>
        }
        secondary={formatDate(project.updated_at)}
        secondaryTypographyProps={{ variant: 'caption' }}
      />
      <IconButton size="small" onClick={(e) => openMenu(e, project)}>
        <MoreVert fontSize="small" />
      </IconButton>
    </ListItemButton>
  );

  const renderFolderNode = (node: FolderTreeNode, depth: number) => {
    const isExpanded = expanded.has(node.id);
    const folderProjects = getProjectsInFolder(node.id);
    const hasChildren = node.children.length > 0 || folderProjects.length > 0;

    return (
      <Box key={node.id}>
        <ListItemButton
          onClick={() => {
            toggleExpand(node.id);
          }}
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
            isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />
          )}
        </ListItemButton>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
            {folderProjects.map((project) => renderProjectItem(project, depth + 1))}
          </Collapse>
        )}
      </Box>
    );
  };

  const rootProjects = getProjectsInFolder(null);

  return (
    <Box>
      <List dense disablePadding>
        {/* Root-level projects header */}
        <ListItemButton
          selected={currentFolderId === null}
          onClick={() => onSelectFolder(null)}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={copyOnly ? 'Course Projects' : 'My Projects'}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 'bold' }}
          />
        </ListItemButton>

        {/* Folder tree with nested projects */}
        {folderTree.map((node) => renderFolderNode(node, 1))}

        {/* Root-level projects (not in any folder) */}
        {rootProjects.map((project) => renderProjectItem(project, 1))}

        {/* Empty state */}
        {folderTree.length === 0 && rootProjects.length === 0 && (
          <Box sx={{ pl: 4, py: 2 }}>
            <Typography variant="caption" color="text.secondary">
              No projects yet
            </Typography>
          </Box>
        )}
      </List>

      {/* Project context menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {copyOnly ? (
          <MenuItem
            onClick={() => {
              if (menuProject) onCopyProject?.(menuProject);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <ContentCopy fontSize="small" />
            </ListItemIcon>
            Copy to My Projects
          </MenuItem>
        ) : (
          [
            <MenuItem
              key="open"
              onClick={() => {
                if (menuProject) navigate(`/project/${menuProject.id}/design`);
                closeMenu();
              }}
            >
              <ListItemIcon>
                <OpenIcon fontSize="small" />
              </ListItemIcon>
              Open
            </MenuItem>,
            <MenuItem
              key="edit"
              onClick={() => {
                if (menuProject) onEditProject?.(menuProject);
                closeMenu();
              }}
            >
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              Edit
            </MenuItem>,
            <MenuItem
              key="duplicate"
              onClick={() => {
                if (menuProject) onDuplicateProject?.(menuProject);
                closeMenu();
              }}
            >
              <ListItemIcon>
                <CopyIcon fontSize="small" />
              </ListItemIcon>
              Duplicate
            </MenuItem>,
            <MenuItem
              key="delete"
              onClick={() => {
                if (menuProject) onDeleteProject?.(menuProject);
                closeMenu();
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" color="error" />
              </ListItemIcon>
              Delete
            </MenuItem>,
          ]
        )}
      </Menu>
    </Box>
  );
}

export default ProjectTreeView;
