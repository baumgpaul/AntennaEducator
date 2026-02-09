import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppDispatch } from '@/store/hooks';
import { updateProject } from '@/store/projectsSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { useState, useEffect } from 'react';
import { formatErrorMessage } from '@/utils/errors';
import type { Project } from '@/types/models';

// Validation schema
const projectSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface EditProjectDialogProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
}

/**
 * EditProjectDialog - Dialog for editing existing projects
 */
function EditProjectDialog({ open, project, onClose }: EditProjectDialogProps) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Reset form when project changes
  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        description: project.description || '',
      });
    }
  }, [project, reset]);

  const handleClose = () => {
    if (!loading) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: ProjectFormData) => {
    if (!project) return;

    setLoading(true);
    try {
      await dispatch(updateProject({ id: project.id, data })).unwrap();
      dispatch(showSuccess('Project updated successfully!'));
      handleClose();
    } catch (error) {
      const message = formatErrorMessage(error);
      dispatch(showError(`Failed to update project: ${message}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit(onSubmit),
      }}
    >
      <DialogTitle>Edit Project</DialogTitle>
      <DialogContent>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              autoFocus
              margin="normal"
              label="Project Name"
              fullWidth
              required
              error={!!errors.name}
              helperText={errors.name?.message}
              disabled={loading}
            />
          )}
        />
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              margin="normal"
              label="Description"
              fullWidth
              multiline
              rows={3}
              error={!!errors.description}
              helperText={errors.description?.message}
              disabled={loading}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          Update
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default EditProjectDialog;
