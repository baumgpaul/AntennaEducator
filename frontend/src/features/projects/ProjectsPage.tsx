import {
  Box,
  Button,
  Typography,
  Grid,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Fab,
  Skeleton,
  Alert,
  AlertTitle,
  Breadcrumbs,
  Link,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Home as HomeIcon,
  GridView as GridViewIcon,
  ViewList as ListViewIcon,
  CreateNewFolder as CreateNewFolderIcon,
} from '@mui/icons-material';
import { useState, useEffect, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchProjects, deleteProject, duplicateProject } from '@/store/projectsSlice';
import {
  fetchFolders,
  createFolder,
  updateFolder,
  deleteFolder as deleteFolderAction,
  selectFolderTree,
  selectFolders,
  setCurrentFolderId,
  selectCurrentFolderId,
  resetProjectToSource,
} from '@/store/foldersSlice';
import type { FolderTreeNode } from '@/store/foldersSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import ProjectCard from './ProjectCard';
import ProjectTreeView from './ProjectTreeView';
import NewProjectDialog from './NewProjectDialog';
import EditProjectDialog from './EditProjectDialog';
import FolderCard from './FolderCard';

import { FolderDialog } from '@/components/common';
import { formatErrorMessage } from '@/utils/errors';
import type { Project } from '@/types/models';

/**
 * ProjectsPage - Main projects management page
 * Folders & projects with breadcrumb drill-down, grid/tree view
 */
function ProjectsPage() {
  const dispatch = useAppDispatch();
  const { items: projects, loading, error } = useAppSelector((state) => state.projects);
  const folderTree = useAppSelector(selectFolderTree);
  const allFolders = useAppSelector(selectFolders);
  const currentFolderId = useAppSelector(selectCurrentFolderId);


  const [viewMode, setViewMode] = useState<'grid' | 'tree'>(
    () => (localStorage.getItem('projectViewMode') as 'grid' | 'tree') || 'grid',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Folder dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParentId, setFolderDialogParentId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<FolderTreeNode | null>(null);

  // Fetch projects and folders on mount
  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchFolders());
  }, [dispatch]);

  const handleRetry = () => {
    dispatch(fetchProjects());
    dispatch(fetchFolders());
  };

  const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'grid' | 'tree' | null) => {
    if (newMode) {
      setViewMode(newMode);
      localStorage.setItem('projectViewMode', newMode);
    }
  };

  // ── Navigation ───────────────────────────────────────────────────────────

  const handleSelectFolder = (folderId: string | null) => {
    dispatch(setCurrentFolderId(folderId));
  };

  // ── Filtered & sorted projects ───────────────────────────────────────────

  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const matchesFolder = currentFolderId === null
          ? !project.folder_id
          : project.folder_id === currentFolderId;
        if (!matchesFolder) return false;

        const query = searchQuery.toLowerCase();
        if (!query) return true;
        const nameMatch = project.name.toLowerCase().includes(query);
        const descriptionMatch = project.description &&
          !project.description.startsWith('[') &&
          project.description.toLowerCase().includes(query);
        return nameMatch || descriptionMatch;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'created':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'updated':
          default:
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }
      });
  }, [projects, currentFolderId, searchQuery, sortBy]);

  // ── Child folders for current folder ─────────────────────────────────────

  const childFolders = useMemo(() => {
    if (currentFolderId === null) return folderTree;
    const findNode = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
      for (const node of nodes) {
        if (node.id === currentFolderId) return node.children;
        const found = findNode(node.children);
        if (found.length > 0 || node.children.some((c) => c.id === currentFolderId)) {
          return node.id === currentFolderId ? node.children : findNode(node.children);
        }
      }
      return [];
    };
    return findNode(folderTree);
  }, [folderTree, currentFolderId]);

  // Count projects per folder
  const projectCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => {
      if (p.folder_id) counts.set(p.folder_id, (counts.get(p.folder_id) ?? 0) + 1);
    });
    return counts;
  }, [projects]);

  // ── Breadcrumbs ──────────────────────────────────────────────────────────

  const breadcrumbs = useMemo(() => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'My Projects' }];
    if (currentFolderId) {
      const buildPath = (folderId: string) => {
        const folder = allFolders.find((f) => f.id === folderId);
        if (folder) {
          if (folder.parent_folder_id) buildPath(folder.parent_folder_id);
          path.push({ id: folder.id, name: folder.name });
        }
      };
      buildPath(currentFolderId);
    }
    return path;
  }, [currentFolderId, allFolders]);

  // ── Project handlers ─────────────────────────────────────────────────────

  const handleNewProject = () => setShowNewProjectDialog(true);

  const handleEditProject = (project: Project) => setEditingProject(project);

  const handleDeleteProject = async (project: Project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      try {
        await dispatch(deleteProject(project.id)).unwrap();
        dispatch(showSuccess('Project deleted successfully'));
      } catch (err) {
        dispatch(showError(`Failed to delete project: ${formatErrorMessage(err)}`));
      }
    }
  };

  const handleDuplicateProject = async (project: Project) => {
    try {
      await dispatch(duplicateProject(project.id)).unwrap();
      dispatch(showSuccess(`Project "${project.name}" duplicated successfully`));
    } catch (err) {
      dispatch(showError(`Failed to duplicate project: ${formatErrorMessage(err)}`));
    }
  };

  const handleResetProject = async (project: Project) => {
    if (!window.confirm(`Reset "${project.name}" to its original course state? Your changes will be lost.`)) return;
    try {
      await dispatch(resetProjectToSource(String(project.id))).unwrap();
      dispatch(showSuccess(`"${project.name}" has been reset to its original state.`));
    } catch (err) {
      dispatch(showError(`Failed to reset project: ${formatErrorMessage(err)}`));
    }
  };

  // ── Folder handlers ──────────────────────────────────────────────────────

  const handleCreateFolder = (parentFolderId: string | null) => {
    setFolderDialogParentId(parentFolderId);
    setRenamingFolder(null);
    setFolderDialogOpen(true);
  };

  const handleRenameFolder = (folder: FolderTreeNode) => {
    setRenamingFolder(folder);
    setFolderDialogParentId(null);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = async (folder: FolderTreeNode) => {
    if (window.confirm(`Delete folder "${folder.name}"? Projects inside will be moved to root.`)) {
      try {
        await dispatch(deleteFolderAction(folder.id)).unwrap();
        if (currentFolderId === folder.id) dispatch(setCurrentFolderId(null));
        dispatch(fetchProjects());
        dispatch(showSuccess('Folder deleted'));
      } catch (err) {
        dispatch(showError(`Failed to delete folder: ${formatErrorMessage(err)}`));
      }
    }
  };

  const handleFolderDialogSubmit = async (name: string) => {
    try {
      if (renamingFolder) {
        await dispatch(updateFolder({ folderId: renamingFolder.id, data: { name } })).unwrap();
        dispatch(showSuccess('Folder renamed'));
      } else {
        await dispatch(createFolder({
          name,
          parent_folder_id: folderDialogParentId,
        })).unwrap();
        dispatch(showSuccess('Folder created'));
      }
    } catch (err) {
      dispatch(showError(`Failed: ${formatErrorMessage(err)}`));
    }
  };

  // ── Skeleton loader ──────────────────────────────────────────────────────

  const ProjectSkeleton = () => (
    <Grid item xs={12} sm={6} md={4} data-testid="skeleton-project-card">
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={140} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="text" sx={{ fontSize: '1.5rem' }} />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="60%" />
      </Box>
    </Grid>
  );

  // ── Determine what to display in main content ────────────────────────────

  const displayProjects = filteredProjects;

  const displayTitle = currentFolderId
    ? breadcrumbs[breadcrumbs.length - 1]?.name
    : 'My Projects';

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderToolbar = () => (
    <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
      <TextField
        size="small"
        placeholder="Search projects..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ flex: 1, minWidth: 200 }}
      />

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Sort by</InputLabel>
        <Select
          value={sortBy}
          label="Sort by"
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <MenuItem value="updated">Last Updated</MenuItem>
          <MenuItem value="created">Date Created</MenuItem>
          <MenuItem value="name">Name</MenuItem>
        </Select>
      </FormControl>

      <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewModeChange} size="small">
        <ToggleButton value="grid">
          <Tooltip title="Grid view"><GridViewIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="tree">
          <Tooltip title="Tree view"><ListViewIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Button
        variant="outlined"
        size="small"
        startIcon={<CreateNewFolderIcon />}
        onClick={() => handleCreateFolder(currentFolderId)}
      >
        New Folder
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        onClick={handleNewProject}
      >
        New Project
      </Button>
    </Box>
  );

  const renderEmptyState = () => (
    <Box sx={{ textAlign: 'center', py: 8, px: 2 }}>
      <Typography variant="h6" gutterBottom>
        {searchQuery ? 'No projects found' : 'No projects yet'}
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        {searchQuery
          ? 'Try adjusting your search query'
          : 'Create your first antenna simulation project to get started'}
      </Typography>
      {!searchQuery && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewProject} sx={{ mt: 2 }}>
          Create Project
        </Button>
      )}
    </Box>
  );

  // ── Home section: folders + projects with breadcrumb drill-down ──────────

  const renderHomeContent = () => {
    const showFolders = viewMode === 'grid' && childFolders.length > 0;
    const hasContent = viewMode === 'tree'
      ? (folderTree.length > 0 || projects.length > 0)
      : (showFolders || displayProjects.length > 0);

    if (loading && projects.length === 0) {
      return (
        <Grid container spacing={3}>
          {[...Array(6)].map((_, i) => <ProjectSkeleton key={i} />)}
        </Grid>
      );
    }

    if (!hasContent) return renderEmptyState();

    if (viewMode === 'tree') {
      return (
        <ProjectTreeView
          folderTree={folderTree}
          projects={projects}
          currentFolderId={currentFolderId}
          onSelectFolder={handleSelectFolder}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
          onDuplicateProject={handleDuplicateProject}
        />
      );
    }

    return (
      <Grid container spacing={3}>
        {childFolders.map((folder) => (
          <Grid item xs={12} sm={6} md={4} key={`folder-${folder.id}`}>
            <FolderCard
              folder={folder}
              projectCount={projectCountByFolder.get(folder.id) ?? 0}
              subfolderCount={folder.children.length}
              onOpen={handleSelectFolder}
              onRename={handleRenameFolder}
              onDelete={handleDeleteFolder}
              onCreateSubfolder={handleCreateFolder}
            />
          </Grid>
        ))}
        {displayProjects.map((project) => (
          <Grid item xs={12} sm={6} md={4} key={project.id}>
            <ProjectCard
              project={project}
              onEdit={handleEditProject}
              onDelete={handleDeleteProject}
              onDuplicate={handleDuplicateProject}
              onReset={handleResetProject}
            />
          </Grid>
        ))}
      </Grid>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', mt: 2, mb: 4, px: 2, gap: 2, height: 'calc(100vh - 120px)' }}>
      {/* Main content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Breadcrumbs sx={{ mb: 1 }}>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return isLast ? (
                <Typography key={crumb.id ?? 'root'} variant="body2" color="text.primary">
                  {crumb.name}
                </Typography>
              ) : (
                <Link
                  key={crumb.id ?? 'root'}
                  component="button"
                  variant="body2"
                  underline="hover"
                  onClick={() => handleSelectFolder(crumb.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  {index === 0 && <HomeIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />}
                  {crumb.name}
                </Link>
              );
            })}
          </Breadcrumbs>
          <Typography variant="h5" gutterBottom>
            {displayTitle}
          </Typography>
        </Box>

        {/* Toolbar */}
        {renderToolbar()}

        {/* Error Alert */}
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={handleRetry}>
                Retry
              </Button>
            }
          >
            <AlertTitle>Failed to load projects</AlertTitle>
            {formatErrorMessage(error)}
          </Alert>
        )}

        {/* Section content */}
        {renderHomeContent()}
      </Box>

      {/* Floating Action Button for mobile */}
      <Fab
          color="primary"
          aria-label="add project"
          onClick={handleNewProject}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            display: { xs: 'flex', sm: 'none' },
          }}
        >
          <AddIcon />
        </Fab>

      {/* New Project Dialog */}
      <NewProjectDialog
        open={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
      />

      {/* Edit Project Dialog */}
      <EditProjectDialog
        open={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
      />

      {/* Folder Create/Rename Dialog */}
      <FolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        onSubmit={handleFolderDialogSubmit}
        title={renamingFolder ? 'Rename Folder' : 'New Folder'}
        initialName={renamingFolder?.name ?? ''}
        submitLabel={renamingFolder ? 'Rename' : 'Create'}
      />
    </Box>
  );
}

export default ProjectsPage;
