import { Box, Container, Typography, Paper, TextField, Button, Link as MuiLink, CircularProgress } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loginStart, loginSuccess, loginFailure } from '@/store/authSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { loginSchema, type LoginFormData } from '@/utils/validation';
import { authApi } from '@/api';

/**
 * LoginPage - User authentication with form validation
 * Uses react-hook-form with Zod validation schema
 */
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { loading } = useAppSelector((state) => state.auth);

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

  const onSubmit = async (data: LoginFormData) => {
    dispatch(loginStart());
    
    try {
      // Call real backend authentication API
      const response = await authApi.login({
        email: data.email,
        password: data.password,
      });
      
      dispatch(loginSuccess({ user: response.user, tokens: response.tokens }));
      dispatch(showSuccess('Login successful!'));
      // Redirect to the page they were trying to access, or home
      navigate(from, { replace: true });
    } catch (error: any) {
      const errorMessage = error?.details?.detail || error?.message || 'Invalid credentials';
      dispatch(loginFailure(errorMessage));
      dispatch(showError(`Login failed: ${errorMessage}`));
    }
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
