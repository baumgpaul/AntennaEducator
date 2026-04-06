import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Chip,
  Skeleton,
  Alert,
  AlertTitle,
  Breadcrumbs,
  Link,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
} from '@mui/material';
import {
  School,
  ContentCopy,
  Add as AddIcon,
  Home as HomeIcon,
  Edit,
  Delete,
  MoreVert,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  OpenInNew,
} from '@mui/icons-material';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchCourses,
  fetchCourseProjects,
  createCourse,
  updateCourse,
  deleteCourse,
  copyCourseToUser,
  copyCourseProjectToUser,
  selectCourses,
  selectCourseProjects,
  selectCourseLoading,
  selectCopyLoading,
  selectFoldersError,
  fetchFolders,
} from '@/store/foldersSlice';
import type { Folder, ProjectListItem } from '@/store/foldersSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { deleteProject } from '@/store/projectsSlice';
import { FolderDialog } from '@/components/common';
import NewProjectDialog from '@/features/projects/NewProjectDialog';
import { formatErrorMessage } from '@/utils/errors';

/**
 * CoursesPage — Browse and copy public courses.
 * Maintainers/admins can create, edit, and delete courses.
 */
function CoursesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const courses = useAppSelector(selectCourses);
  const courseProjects = useAppSelector(selectCourseProjects);
  const loading = useAppSelector(selectCourseLoading);
  const copyLoading = useAppSelector(selectCopyLoading);
  const error = useAppSelector(selectFoldersError);
  const user = useAppSelector((state) => state.auth.user);

  const isMaintainer = user?.role === 'maintainer' || user?.role === 'admin';

  // Navigation state for nested course folders
  const [pathStack, setPathStack] = useState<Folder[]>([]);
  const currentParentId: string | null =
    pathStack.length > 0 ? pathStack[pathStack.length - 1].id : null;

  // Dialog state
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Folder | null>(null);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  // Context menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuCourse, setMenuCourse] = useState<Folder | null>(null);
  const [menuProject, setMenuProject] = useState<ProjectListItem | null>(null);

  // Fetch top-level courses on mount, sub-courses when navigating
  useEffect(() => {
    dispatch(fetchCourses(currentParentId));
    if (currentParentId) {
      dispatch(fetchCourseProjects(currentParentId));
    }
  }, [dispatch, currentParentId]);

  // Filter to only show courses with matching parent
  const visibleCourses = useMemo(
    () =>
      courses.filter((c) =>
        currentParentId ? c.parent_folder_id === currentParentId : !c.parent_folder_id,
      ),
    [courses, currentParentId],
  );

  // ── Navigation ───────────────────────────────────────────────────────────

  const navigateIntoCourse = (course: Folder) => {
    setPathStack((prev) => [...prev, course]);
  };

  const navigateToRoot = () => {
    setPathStack([]);
  };

  const navigateToLevel = (index: number) => {
    setPathStack((prev) => prev.slice(0, index + 1));
  };

  // ── Course CRUD (maintainer/admin) ───────────────────────────────────────

  const handleCreateCourse = () => {
    setEditingCourse(null);
    setCourseDialogOpen(true);
  };

  const handleEditCourse = (course: Folder) => {
    setEditingCourse(course);
    setCourseDialogOpen(true);
  };

  const handleDeleteCourse = async (course: Folder) => {
    if (window.confirm(`Delete course "${course.name}" and all its sub-courses?`)) {
      try {
        await dispatch(deleteCourse(course.id)).unwrap();
        dispatch(fetchCourses(currentParentId));
        dispatch(showSuccess('Course deleted'));
      } catch (err) {
        dispatch(showError(`Failed to delete course: ${formatErrorMessage(err)}`));
      }
    }
  };

  const handleCourseDialogSubmit = async (name: string) => {
    try {
      if (editingCourse) {
        await dispatch(updateCourse({ folderId: editingCourse.id, data: { name } })).unwrap();
        dispatch(showSuccess('Course renamed'));
      } else {
        await dispatch(
          createCourse({ name, parent_folder_id: currentParentId }),
        ).unwrap();
        dispatch(showSuccess('Course created'));
      }
      dispatch(fetchCourses(currentParentId));
    } catch (err) {
      dispatch(showError(`Failed: ${formatErrorMessage(err)}`));
    }
  };

  // ── Deep Copy ────────────────────────────────────────────────────────────

  const handleCopyCourse = async (course: Folder) => {
    try {
      await dispatch(copyCourseToUser({ folderId: course.id })).unwrap();
      dispatch(fetchFolders()); // refresh user folders
      dispatch(showSuccess(`Course "${course.name}" copied to your projects!`));
    } catch (err) {
      dispatch(showError(`Failed to copy course: ${formatErrorMessage(err)}`));
    }
  };

  const handleCopyProject = async (project: ProjectListItem) => {
    try {
      await dispatch(copyCourseProjectToUser({ projectId: project.id })).unwrap();
      dispatch(showSuccess(`Project "${project.name}" copied to your projects!`));
    } catch (err) {
      dispatch(showError(`Failed to copy project: ${formatErrorMessage(err)}`));
    }
  };

  // ── Course project actions (maintainers) ──────────────────────────────

  const handleEditProject = (project: ProjectListItem) => {
    navigate(`/project/${project.id}/design`);
  };

  const handleDeleteProject = async (project: ProjectListItem) => {
    if (window.confirm(`Delete project "${project.name}"?`)) {
      try {
        await dispatch(deleteProject(project.id)).unwrap();
        if (currentParentId) dispatch(fetchCourseProjects(currentParentId));
        dispatch(showSuccess('Project deleted'));
      } catch (err) {
        dispatch(showError(`Failed to delete project: ${formatErrorMessage(err)}`));
      }
    }
  };

  // ── Context menus ────────────────────────────────────────────────────────

  const openCourseMenu = (event: React.MouseEvent<HTMLElement>, course: Folder) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuCourse(course);
    setMenuProject(null);
  };

  const openProjectMenu = (event: React.MouseEvent<HTMLElement>, project: ProjectListItem) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuProject(project);
    setMenuCourse(null);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuCourse(null);
    setMenuProject(null);
  };

  return (
    <Box sx={{ p: 3, overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <School sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5">Courses</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Public courses available for all users. Copy them into your projects to get started.
      </Typography>

      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          variant="body2"
          underline="hover"
          onClick={navigateToRoot}
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <HomeIcon sx={{ fontSize: 16, mr: 0.5 }} />
          Courses
        </Link>
        {pathStack.map((folder, index) => {
          const isLast = index === pathStack.length - 1;
          return isLast ? (
            <Typography key={folder.id} variant="body2" color="text.primary">
              {folder.name}
            </Typography>
          ) : (
            <Link
              key={folder.id}
              component="button"
              variant="body2"
              underline="hover"
              onClick={() => navigateToLevel(index)}
              sx={{ cursor: 'pointer' }}
            >
              {folder.name}
            </Link>
          );
        })}
      </Breadcrumbs>

      {/* Toolbar for maintainers */}
      {isMaintainer && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleCreateCourse}>
            New Course
          </Button>
          {currentParentId && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setNewProjectDialogOpen(true)}>
              New Project
            </Button>
          )}
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => dispatch(fetchCourses(currentParentId))}>
              Retry
            </Button>
          }
        >
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Grid container spacing={2}>
          {[...Array(4)].map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Course Folders */}
      {!loading && (
        <>
          {visibleCourses.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Courses
              </Typography>
              <Grid container spacing={2}>
                {visibleCourses.map((course) => (
                  <Grid item xs={12} sm={6} md={4} key={course.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                      }}
                      onClick={() => navigateIntoCourse(course)}
                    >
                      <CardContent sx={{ pb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <FolderIcon color="primary" />
                          <Typography variant="subtitle1" noWrap sx={{ flex: 1 }}>
                            {course.name}
                          </Typography>
                          <IconButton size="small" onClick={(e) => openCourseMenu(e, course)}>
                            <MoreVert fontSize="small" />
                          </IconButton>
                        </Box>
                      </CardContent>
                      <CardActions>
                        <Tooltip title="Copy entire course to your projects">
                          <Button
                            size="small"
                            startIcon={<ContentCopy />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyCourse(course);
                            }}
                            disabled={copyLoading}
                          >
                            Copy
                          </Button>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Projects inside current course folder */}
          {currentParentId && courseProjects.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Projects in this course
              </Typography>
              <Grid container spacing={2}>
                {courseProjects.map((project) => (
                  <Grid item xs={12} sm={6} md={4} key={project.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" noWrap>
                              {project.name}
                            </Typography>
                            {project.description && !project.description.startsWith('[') && (
                              <Typography variant="body2" color="text.secondary" noWrap>
                                {project.description}
                              </Typography>
                            )}
                          </Box>
                          <IconButton size="small" onClick={(e) => openProjectMenu(e, project)}>
                            <MoreVert fontSize="small" />
                          </IconButton>
                        </Box>
                        {project.has_documentation && (
                          <Chip
                            icon={<DescriptionIcon />}
                            label="Has docs"
                            size="small"
                            variant="outlined"
                            sx={{ mt: 1 }}
                          />
                        )}
                      </CardContent>
                      <CardActions>
                        <Tooltip title="Copy this project to your projects">
                          <Button
                            size="small"
                            startIcon={<ContentCopy />}
                            onClick={() => handleCopyProject(project)}
                            disabled={copyLoading}
                          >
                            Copy
                          </Button>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Empty state */}
          {visibleCourses.length === 0 && (!currentParentId || courseProjects.length === 0) && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <School sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {currentParentId ? 'No items in this course' : 'No courses available yet'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isMaintainer
                  ? 'Create the first course to get started.'
                  : 'Check back later for new courses.'}
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {/* Course menu items */}
        {menuCourse && (
          <>
            <MenuItem
              onClick={() => {
                handleCopyCourse(menuCourse);
                closeMenu();
              }}
            >
              <ListItemIcon>
                <ContentCopy fontSize="small" />
              </ListItemIcon>
              Copy to My Projects
            </MenuItem>
            {isMaintainer && (
              <>
                <MenuItem
                  onClick={() => {
                    handleEditCourse(menuCourse);
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    <Edit fontSize="small" />
                  </ListItemIcon>
                  Rename
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    handleDeleteCourse(menuCourse);
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    <Delete fontSize="small" />
                  </ListItemIcon>
                  Delete
                </MenuItem>
              </>
            )}
          </>
        )}
        {/* Project menu items */}
        {menuProject && (
          <>
            <MenuItem
              onClick={() => {
                handleCopyProject(menuProject);
                closeMenu();
              }}
            >
              <ListItemIcon>
                <ContentCopy fontSize="small" />
              </ListItemIcon>
              Copy to My Projects
            </MenuItem>
            {isMaintainer && (
              <>
                <MenuItem
                  onClick={() => {
                    handleEditProject(menuProject);
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    <OpenInNew fontSize="small" />
                  </ListItemIcon>
                  Open in Designer
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    handleDeleteProject(menuProject);
                    closeMenu();
                  }}
                >
                  <ListItemIcon>
                    <Delete fontSize="small" />
                  </ListItemIcon>
                  Delete
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>

      {/* Course Create/Rename Dialog */}
      <FolderDialog
        open={courseDialogOpen}
        onClose={() => setCourseDialogOpen(false)}
        onSubmit={handleCourseDialogSubmit}
        title={editingCourse ? 'Rename Course' : 'New Course'}
        initialName={editingCourse?.name ?? ''}
        submitLabel={editingCourse ? 'Rename' : 'Create'}
      />

      {/* New Project Dialog (inside course folder) */}
      <NewProjectDialog
        open={newProjectDialogOpen}
        onClose={() => {
          setNewProjectDialogOpen(false);
          if (currentParentId) dispatch(fetchCourseProjects(currentParentId));
        }}
        folderId={currentParentId}
      />
    </Box>
  );
}

export default CoursesPage;
