import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
} from '@mui/material';
import {
  Sensors as PeecIcon,
  GridOn as FdtdIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppDispatch } from '@/store/hooks';
import { createProject } from '@/store/projectsSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { useState } from 'react';
import { formatErrorMessage } from '@/utils/errors';

// Validation schema
const projectSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  project_type: z.enum(['peec', 'fdtd']),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROJECT_TYPE_OPTIONS = [
  {
    value: 'peec' as const,
    label: 'PEEC',
    description: 'Partial Element Equivalent Circuit — wire antennas',
    icon: PeecIcon,
  },
  {
    value: 'fdtd' as const,
    label: 'FDTD',
    description: 'Finite-Difference Time-Domain — broadband analysis',
    icon: FdtdIcon,
  },
];

/**
 * NewProjectDialog - Dialog for creating new projects
 */
function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      project_type: 'peec',
    },
  });

  const selectedType = watch('project_type');

  const handleClose = () => {
    if (!loading) {
      reset();
      onClose();
    }
  };

  const onSubmit = async (data: ProjectFormData) => {
    setLoading(true);
    try {
      await dispatch(createProject(data)).unwrap();
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
        {/* Project type selector */}
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
          Simulation Method
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {PROJECT_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = selectedType === opt.value;
            return (
              <Card
                key={opt.value}
                variant="outlined"
                sx={{
                  flex: 1,
                  border: 2,
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'action.selected' : 'background.paper',
                }}
              >
                <CardActionArea
                  onClick={() => setValue('project_type', opt.value)}
                  disabled={loading}
                  sx={{ p: 1.5, textAlign: 'center' }}
                >
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <Icon sx={{ fontSize: 32, color: selected ? 'primary.main' : 'text.secondary' }} />
                    <Typography variant="subtitle1" fontWeight="bold">
                      {opt.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {opt.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>

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
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NewProjectDialog;
