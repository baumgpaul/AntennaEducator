import { useState } from 'react';
import { Box, Container, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { IMPRINT, PRIVACY, type Lang, type LegalDocument } from './content';
import { LEGAL_VERSION } from './operator';
import LegalLinks from './LegalLinks';

const DOCUMENTS: Record<'privacy' | 'imprint', Record<Lang, LegalDocument>> = {
  privacy: PRIVACY,
  imprint: IMPRINT,
};

function initialLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
}

/** Public (no login) privacy notice / imprint, in English and German. */
export default function LegalPage({ doc }: { doc: 'privacy' | 'imprint' }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const content = DOCUMENTS[doc][lang];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 2, sm: 4 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
            <Typography variant="h4" component="h1">
              {content.title}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={lang}
              onChange={(_, value: Lang | null) => value && setLang(value)}
              aria-label="Language"
            >
              <ToggleButton value="en">EN</ToggleButton>
              <ToggleButton value="de">DE</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {content.sections.map((section) => (
            <Box key={section.title} component="section" sx={{ mb: 3 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                {section.title}
              </Typography>
              {section.paragraphs.map((p) => (
                <Typography key={p} variant="body1" paragraph>
                  {p}
                </Typography>
              ))}
            </Box>
          ))}
          <Typography variant="body2" color="text.secondary">
            {lang === 'de' ? 'Stand' : 'Version'}: {LEGAL_VERSION}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <LegalLinks />
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
