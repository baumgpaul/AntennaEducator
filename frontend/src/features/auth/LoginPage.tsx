import { Box, Container, Typography, Paper, TextField, Button, Link as MuiLink, CircularProgress, Alert, FormControlLabel, Checkbox } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loginAsync, clearAuthError } from '@/store/authSlice';
import { showSuccess } from '@/store/uiSlice';
import { loginSchema, type LoginFormData } from '@/utils/validation';

/**
 * LoginPage - User authentication with form validation
 * Uses react-hook-form with Zod validation schema
 */
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated } = useAppSelector((state) => state.auth);
  const [rememberMe, setRememberMe] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Get the page user was trying to access before being redirected to login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Clear errors on mount and check for stored error details
  useEffect(() => {
    dispatch(clearAuthError());

    // Check if user was redirected here due to session expiry
    const logoutReason = localStorage.getItem('logout_reason');

    if (logoutReason) {
      console.log('[Auth] Redirected to login, reason:', logoutReason);
      setSessionExpired(true);

      // Clear after reading
      localStorage.removeItem('last_auth_error');
      localStorage.removeItem('logout_reason');
    }
  }, [dispatch]);

  // Navigate on successful authentication
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(showSuccess('Login successful!'));
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from, dispatch]);

  const onSubmit = async (data: LoginFormData) => {
    dispatch(clearAuthError());
    await dispatch(loginAsync({
      email: data.email,
      password: data.password,
    }));
  };

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
            Antenna Educator
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            Sign in to your account
          </Typography>

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 3 }}>
            {sessionExpired && (
              <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setSessionExpired(false)}>
                Your session has expired. Please sign in again.
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

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
                  autoFocus
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

            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  color="primary"
                  disabled={loading}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Remember me
                </Typography>
              }
              sx={{ mt: 1 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Don't have an account?{' '}
                <MuiLink
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/register')}
                  type="button"
                >
                  Sign up
                </MuiLink>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default LoginPage;
