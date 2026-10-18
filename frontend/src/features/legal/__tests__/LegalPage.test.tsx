import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LegalPage from '../LegalPage';
import { OPERATOR } from '../operator';

function renderPage(doc: 'privacy' | 'imprint') {
  render(
    <MemoryRouter>
      <LegalPage doc={doc} />
    </MemoryRouter>
  );
}

describe('LegalPage', () => {
  it('privacy notice names the controller and the retention period', () => {
    renderPage('privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(OPERATOR.email.replace('.', '\\.')))).toBeInTheDocument();
    expect(screen.getByText(/12 months after your last activity/)).toBeInTheDocument();
  });

  it('switches to German', async () => {
    renderPage('privacy');
    await userEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument();
    expect(screen.getByText(/12 Monate nach Ihrer letzten Aktivität/)).toBeInTheDocument();
  });

  it('imprint shows name and place of residence', () => {
    renderPage('imprint');
    expect(screen.getByText(`${OPERATOR.name}, ${OPERATOR.place.en}`)).toBeInTheDocument();
  });
});
