import { Box, Container, Typography, Paper, TextField, Button, Link as MuiLink } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/store/hooks';
import { loginStart, loginSuccess, loginFailure } from '@/store/authSlice';
import { showSuccess, showError } from '@/store/uiSlice';

/**
 * LoginPage - User authentication
 * Placeholder implementation with mock auth - will be enhanced in Task 9
 */
function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    dispatch(loginStart());
    
    // Mock authentication for now (will integrate with backend in Task 9)
    try {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate API call
      
      const mockUser = {
        id: '1',
        username: email.split('@')[0],
        email: email,
        created_at: new Date().toISOString(),
      }
      
      const mockTokens = {
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token',
      };
      
      dispatch(loginSuccess({ user: mockUser, tokens: mockTokens }));
      dispatch(showSuccess('Login successful!'));
      navigate('/');
    } catch (error) {
      dispatch(loginFailure('Invalid credentials'));
      dispatch(showError('Login failed. Please try again.'));
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

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoFocus
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3, mb: 2 }}
            >
              Sign In
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Don't have an account?{' '}
                <MuiLink
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/register')}
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
