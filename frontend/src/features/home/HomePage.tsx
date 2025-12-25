import { Container, Typography, Paper, Grid, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Dashboard, Folder, Assessment } from '@mui/icons-material';

/**
 * HomePage - Landing page after login
 * Placeholder implementation - will be enhanced in later tasks
 */
function HomePage() {
  const navigate = useNavigate();

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
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Dashboard sx={{ fontSize: 48, mb: 2, color: 'primary.main' }} />
            <Typography variant="h5" gutterBottom>
              Design
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ flexGrow: 1 }}>
              Create antenna geometries with our intuitive 3D design interface. Support for dipole, loop, helix, and rod antennas.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/design')}>
              Start Designing
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Folder sx={{ fontSize: 48, mb: 2, color: 'primary.main' }} />
            <Typography variant="h5" gutterBottom>
              Projects
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ flexGrow: 1 }}>
              Manage your antenna projects, save designs, and track simulation progress all in one place.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/projects')}>
              View Projects
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Assessment sx={{ fontSize: 48, mb: 2, color: 'primary.main' }} />
            <Typography variant="h5" gutterBottom>
              Results
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ flexGrow: 1 }}>
              Analyze simulation results with interactive visualizations, including radiation patterns and impedance plots.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/results')}>
              View Results
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default HomePage;
