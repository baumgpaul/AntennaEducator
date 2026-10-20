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
import { createProject } from '@/store/projectsSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { lazy, Suspense, useState } from 'react';
import type { MethodChoice } from '@/features/fem/FemMethodPicker';
import { formatErrorMessage } from '@/utils/errors';

// Method choice (antenna or FEM): only in builds with the FEM flag, see config/features.ts
const FemMethodPicker =
  import.meta.env.VITE_FEATURE_FEM === 'true' ? lazy(() => import('@/features/fem/FemMethodPicker')) : null;
const ANTENNA: MethodChoice = { kind: 'peec', template: 'plate-capacitor' };

// Validation schema
const projectSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  folderId?: string | null;
}

/**
 * NewProjectDialog - Dialog for creating new projects
 */
function NewProjectDialog({ open, onClose, folderId }: NewProjectDialogProps) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<MethodChoice>(ANTENNA);

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

  const handleClose = () => {
    if (!loading) {
      reset();
      setMethod(ANTENNA);
      onClose();
    }
  };

  const onSubmit = async (data: ProjectFormData) => {
    setLoading(true);
    try {
      const fem =
        method.kind === 'fem' && method.design_state
          ? { kind: 'fem' as const, design_state: { ...method.design_state, name: data.name } }
          : {};
      await dispatch(createProject({ ...data, ...fem, folder_id: folderId ?? undefined })).unwrap();
      dispatch(showSuccess('Project created successfully!'));
      handleClose();
    } catch (error) {
      const message = formatErrorMessage(error);
      dispatch(showError(`Failed to create project: ${message}`));
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
      <DialogTitle>Create New Project</DialogTitle>
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
        {FemMethodPicker && (
          <Suspense fallback={null}>
            <FemMethodPicker value={method} onChange={setMethod} />
          </Suspense>
        )}
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
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NewProjectDialog;
