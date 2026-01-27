import { Box, Container, Typography, Paper, TextField, Button, Link as MuiLink, CircularProgress, Alert } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { registerAsync, clearAuthError } from '@/store/authSlice';
import { showSuccess } from '@/store/uiSlice';
import { registerSchema, type RegisterFormData } from '@/utils/validation';

/**
 * RegisterPage - User registration with form validation
 * Uses react-hook-form with Zod validation schema
 */
function RegisterPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated } = useAppSelector((state) => state.auth);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Clear errors on mount
  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  // Navigate on successful authentication (not just registration)
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(showSuccess('Registration successful! Welcome to Antenna Educator.'));
      navigate('/');
    }
  }, [isAuthenticated, navigate, dispatch]);

  const onSubmit = async (data: RegisterFormData) => {
    dispatch(clearAuthError());
    const result = await dispatch(registerAsync({
      email: data.email,
      username: data.username,
      password: data.password,
    }));
    
    // Check if registration succeeded (but user is not yet authenticated)
    if (registerAsync.fulfilled.match(result)) {
      setRegistrationSuccess(true);
    }
  };

  // Show success message if registration completed
  if (registrationSuccess && !isAuthenticated) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Container maxWidth="sm">
          <Paper elevation={3} sx={{ p: 4 }}>
            <Typography variant="h4" align="center" gutterBottom color="success.main">
              Registration Successful!
            </Typography>
            <Alert severity="success" sx={{ mt: 2, mb: 3 }}>
              <Typography variant="body1" paragraph>
                Your account has been created successfully.
              </Typography>
              <Typography variant="body2">
                You can now log in with your credentials.
              </Typography>
            </Alert>
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => navigate('/login')}
              sx={{ mt: 2 }}
            >
              Go to Login
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" align="center" gutterBottom>
            Create Account
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            Sign up for Antenna Educator
          </Typography>

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            <Controller
              name="username"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Username"
                  margin="normal"
                  autoFocus
                  error={!!errors.username}
                  helperText={errors.username?.message}
                  disabled={loading}
                />
              )}
            />

            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Email"
                  type="email"
                  margin="normal"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  disabled={loading}
                />
              )}
            />

            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Password"
                  type="password"
                  margin="normal"
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  disabled={loading}
                />
              )}
            />

            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Confirm Password"
                  type="password"
                  margin="normal"
                  error={!!errors.confirmPassword}
                  helperText={errors.confirmPassword?.message}
                  disabled={loading}
                />
              )}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign Up'}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <MuiLink
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/login')}
                  type="button"
                >
                  Sign in
                </MuiLink>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default RegisterPage;
