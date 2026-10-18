import { Box, Typography } from '@mui/material';
import LegalLinks from '@/features/legal/LegalLinks';
import { OPERATOR } from '@/features/legal/operator';

/**
 * Footer component with copyright and legal links
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          © {currentYear} {OPERATOR.name} · Antenna Educator · MIT License
        </Typography>

        <LegalLinks />
      </div>
    </Box>
  );
}

export default Footer;
