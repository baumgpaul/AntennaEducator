import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FemStudioPage from '../FemStudioPage';

describe('FemStudioPage', () => {
  it('shows the six workflow tabs with the Learn panel of the active step', () => {
    render(<FemStudioPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      '1 Geometry', '2 Materials', '3 Physics', '4 Mesh', '5 Solve', '6 Results',
    ]);
    expect(screen.getByText('Learn: Geometry')).toBeInTheDocument();
  });

  it('explains why a later step is locked', () => {
    render(<FemStudioPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Mesh/ }));
    expect(screen.getByText('Learn: Mesh')).toBeInTheDocument();
    expect(screen.getByText(/opens once Physics/)).toBeInTheDocument();
    // "Next" leads back to the first open step
    fireEvent.click(screen.getByRole('button', { name: /Next: Geometry/ }));
    expect(screen.getByText('Learn: Geometry')).toBeInTheDocument();
  });
});
