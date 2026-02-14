import { useEffect } from 'react';
import { Container, Typography, Paper, Grid, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Folder } from '@mui/icons-material';
import { useAppDispatch } from '@/store/hooks';
import { fetchProjects } from '@/store/projectsSlice';

/**
 * HomePage - Landing page after login
 */
function HomePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  return (
    <Container maxWidth="lg">
      <div style={{ marginTop: '32px', marginBottom: '32px' }}>
        <Typography variant="h3" gutterBottom>
          Welcome to Antenna Educator
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Design, simulate, and analyze antenna systems with our comprehensive PEEC-based solver.
        </Typography>
      </div>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Folder sx={{ fontSize: 48, mb: 2, color: 'primary.main' }} />
            <Typography variant="h5" gutterBottom>
              Projects
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ flexGrow: 1 }}>
              Manage your antenna projects, save designs, and track simulation progress all in one
              place.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/projects')}>
              View Projects
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default HomePage;
