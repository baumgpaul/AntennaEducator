import {
  Box,
  Button,
  Container,
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
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchProjects, deleteProject, duplicateProject } from '@/store/projectsSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import ProjectCard from './ProjectCard';
import NewProjectDialog from './NewProjectDialog';
import EditProjectDialog from './EditProjectDialog';
import { formatErrorMessage } from '@/utils/errors';
import type { Project } from '@/types/models';

/**
 * ProjectsPage - Main projects management page
 * Displays user's projects with filtering and search capabilities
 */
function ProjectsPage() {
  const dispatch = useAppDispatch();
  const { items: projects, loading, error } = useAppSelector((state) => state.projects);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    dispatch(fetchProjects());
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
  };

  // Filter and sort projects
  const filteredProjects = projects
    .filter((project) => {
      const query = searchQuery.toLowerCase();
      const nameMatch = project.name.toLowerCase().includes(query);
      // Only search description if it's not JSON (doesn't start with '[')
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
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          My Projects
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your antenna simulation projects
        </Typography>
      </Box>

      {/* Toolbar */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
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

        <FormControl sx={{ minWidth: 150 }}>
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
    </Container>
  );
}

export default ProjectsPage;
