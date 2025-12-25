import { Box, Typography, Link } from '@mui/material';

/**
 * Footer component with copyright and links
 */
function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        py: 2,
        px: 3,
        mt: 'auto',
        backgroundColor: (theme) =>
          theme.palette.mode === 'light'
            ? theme.palette.grey[200]
            : theme.palette.grey[900],
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          © {currentYear} Antenna Educator. All rights reserved.
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Link href="#" variant="body2" color="text.secondary" underline="hover">
            Documentation
          </Link>
          <Link href="#" variant="body2" color="text.secondary" underline="hover">
            Support
          </Link>
          <Link href="#" variant="body2" color="text.secondary" underline="hover">
            About
          </Link>
        </Box>
      </Box>
    </Box>
  );
}

export default Footer;
