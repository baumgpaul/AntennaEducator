import { Box, Container, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

/**
 * DesignPage - 3D antenna design interface
 * Placeholder implementation - will be fully implemented in Task 11
 */
function DesignPage() {
  const { projectId } = useParams();

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Design Interface
        </Typography>
        {projectId && (
          <Typography variant="body2" color="text.secondary">
            Project ID: {projectId}
          </Typography>
        )}
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          3D antenna design interface with Three.js coming soon...
        </Typography>
      </Box>
    </Container>
  );
}

export default DesignPage;
