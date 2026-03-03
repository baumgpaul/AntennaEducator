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
  Paper,
  Breadcrumbs,
  Link,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
} from '@/store/foldersSlice';
import type { FolderTreeNode } from '@/store/foldersSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import ProjectCard from './ProjectCard';
import NewProjectDialog from './NewProjectDialog';
import EditProjectDialog from './EditProjectDialog';
import { FolderTree, FolderDialog } from '@/components/common';
import { formatErrorMessage } from '@/utils/errors';
import type { Project } from '@/types/models';

/**
 * ProjectsPage - Main projects management page
 * Displays user's projects organized in folders with search and sort
 */
function ProjectsPage() {
  const dispatch = useAppDispatch();
  const { items: projects, loading, error } = useAppSelector((state) => state.projects);
  const folderTree = useAppSelector(selectFolderTree);
  const allFolders = useAppSelector(selectFolders);
  const currentFolderId = useAppSelector(selectCurrentFolderId);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Folder dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParentId, setFolderDialogParentId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<FolderTreeNode | null>(null);

  // Fetch projects and folders on mount
  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchFolders());
  }, [dispatch]);

  // Infinite scroll setup
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
      // In future: dispatch(fetchProjects({ page: page + 1 }));
      // For now, we load all at once, so disable infinite scroll
      setHasMore(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    }, options);

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore]);

  const handleRetry = () => {
    dispatch(fetchProjects());
    dispatch(fetchFolders());
  };

  // Filter projects by current folder and search query, then sort
  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => {
        // Folder filter: null = root (projects with no folder_id)
        const matchesFolder = currentFolderId === null
          ? !project.folder_id
          : project.folder_id === currentFolderId;
        if (!matchesFolder) return false;

        // Text search
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

  // Build breadcrumb path from root to current folder
  const breadcrumbs = useMemo(() => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];
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

  const handleNewProject = () => {
    setShowNewProjectDialog(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
  };

  const handleDeleteProject = async (project: Project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      try {
        await dispatch(deleteProject(project.id)).unwrap();
        dispatch(showSuccess('Project deleted successfully'));
      } catch (error) {
        const message = formatErrorMessage(error);
        dispatch(showError(`Failed to delete project: ${message}`));
      }
    }
  };

  const handleDuplicateProject = async (project: Project) => {
    try {
      await dispatch(duplicateProject(project.id)).unwrap();
      dispatch(showSuccess(`Project "${project.name}" duplicated successfully`));
    } catch (error) {
      const message = formatErrorMessage(error);
      dispatch(showError(`Failed to duplicate project: ${message}`));
    }
  };

  // ── Folder handlers ──────────────────────────────────────────────────────

  const handleSelectFolder = (folderId: string | null) => {
    dispatch(setCurrentFolderId(folderId));
  };

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
        if (currentFolderId === folder.id) {
          dispatch(setCurrentFolderId(null));
        }
        dispatch(fetchProjects()); // Refresh since projects are re-parented
        dispatch(showSuccess('Folder deleted'));
      } catch (error) {
        dispatch(showError(`Failed to delete folder: ${formatErrorMessage(error)}`));
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
    } catch (error) {
      dispatch(showError(`Failed: ${formatErrorMessage(error)}`));
    }
  };

  // Skeleton loader component
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

  return (
    <Box sx={{ display: 'flex', mt: 2, mb: 4, px: 2, gap: 2, height: 'calc(100vh - 120px)' }}>
      {/* Left: Folder Tree Panel */}
      <Paper
        elevation={1}
        sx={{
          width: 260,
          minWidth: 220,
          overflow: 'auto',
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
        }}
      >
        <FolderTree
          tree={folderTree}
          selectedFolderId={currentFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </Paper>

      {/* Right: Projects Content */}
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
                  {index === 0 ? <HomeIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} /> : null}
                  {crumb.name}
                </Link>
              );
            })}
          </Breadcrumbs>
          <Typography variant="h5" gutterBottom>
            {currentFolderId ? breadcrumbs[breadcrumbs.length - 1]?.name : 'My Projects'}
          </Typography>
        </Box>

        {/* Toolbar */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
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

          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleNewProject}
          >
            New Project
          </Button>
        </Box>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRetry}
            >
              Retry
            </Button>
          }
        >
          <AlertTitle>Failed to load projects</AlertTitle>
          {formatErrorMessage(error)}
        </Alert>
      )}

      {/* Projects Grid */}
      {loading && projects.length === 0 ? (
        <Grid container spacing={3}>
          {[...Array(6)].map((_, i) => (
            <ProjectSkeleton key={i} />
          ))}
        </Grid>
      ) : filteredProjects.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            px: 2,
          }}
        >
          <Typography variant="h6" gutterBottom>
            {searchQuery ? 'No projects found' : 'No projects yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {searchQuery
              ? 'Try adjusting your search query'
              : 'Create your first antenna simulation project to get started'}
          </Typography>
          {!searchQuery && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleNewProject}
              sx={{ mt: 2 }}
            >
              Create Project
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredProjects.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project.id}>
              <ProjectCard
                project={project}
                onEdit={handleEditProject}
                onDelete={handleDeleteProject}
                onDuplicate={handleDuplicateProject}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Infinite scroll trigger */}
      {filteredProjects.length > 0 && hasMore && (
        <Box ref={loadMoreRef} sx={{ py: 4, textAlign: 'center' }}>
          {loading && <Skeleton variant="text" width={200} sx={{ mx: 'auto' }} />}
        </Box>
      )}

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
    </Box>
  );
}

export default ProjectsPage;
