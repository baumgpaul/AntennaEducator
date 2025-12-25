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
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { LoadingSpinner, ErrorDisplay } from '@/components/common';
import ProjectCard from './ProjectCard';
import type { Project } from '@/types/models';

/**
 * ProjectsPage - Main projects management page
 * Displays user's projects with filtering and search capabilities
 */
function ProjectsPage() {
  const { items: projects, loading, error } = useAppSelector((state) => state.projects);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  // const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  // Filter and sort projects
  const filteredProjects = projects
    .filter((project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
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
    // setShowNewProjectDialog(true);
    console.log('New project - dialog coming in next step');
  };

  const handleEditProject = (project: Project) => {
    // TODO: Open edit dialog
    console.log('Edit project:', project);
  };

  const handleDeleteProject = (project: Project) => {
    // TODO: Show confirmation and delete
    console.log('Delete project:', project);
  };

  const handleDuplicateProject = (project: Project) => {
    // TODO: Duplicate project
    console.log('Duplicate project:', project);
  };

  if (loading && projects.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <LoadingSpinner message="Loading projects..." />
      </Container>
    );
  }

  if (error && projects.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <ErrorDisplay error={error} />
      </Container>
    );
  }

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

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
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
    </Container>
  );
}

export default ProjectsPage;
