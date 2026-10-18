import { Box, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { OPERATOR } from './operator';

/** Privacy · Imprint · Source links, shown in the footer and on the login pages. */
export default function LegalLinks() {
  return (
    <Box component="nav" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link component={RouterLink} to="/privacy" variant="body2" color="text.secondary" underline="hover">
        Privacy / Datenschutz
      </Link>
      <Link component={RouterLink} to="/imprint" variant="body2" color="text.secondary" underline="hover">
        Imprint / Impressum
      </Link>
      <Link
        href={OPERATOR.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        variant="body2"
        color="text.secondary"
        underline="hover"
      >
        Source code (MIT)
      </Link>
    </Box>
  );
}
