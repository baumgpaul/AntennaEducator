import { Box, Typography, Button, Paper } from '@mui/material';
import { Error as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { parseApiError } from '@/utils/errors';

interface ErrorDisplayProps {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Error display component with retry functionality
 */
function ErrorDisplay({ error, onRetry, compact = false }: ErrorDisplayProps) {
  const errorInfo = parseApiError(error);

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <ErrorIcon fontSize="small" />
        <Typography variant="body2" color="error">
          {errorInfo.message}
        </Typography>
        {errorInfo.retryable && onRetry && (
          <Button size="small" onClick={onRetry} startIcon={<RefreshIcon />}>
            Retry
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        border: 1,
        borderColor: 'error.main',
        bgcolor: 'error.light',
        color: 'error.dark',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <ErrorIcon sx={{ mt: 0.5 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" gutterBottom>
            {errorInfo.title}
          </Typography>
          <Typography variant="body2" paragraph>
            {errorInfo.message}
          </Typography>
          {errorInfo.retryable && onRetry && (
            <Button
              variant="contained"
              color="error"
              onClick={onRetry}
              startIcon={<RefreshIcon />}
            >
              {errorInfo.action || 'Retry'}
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

export default ErrorDisplay;
