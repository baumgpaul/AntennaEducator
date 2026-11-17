import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Colorbar } from './Colorbar';
import { computeAutoRange, NO_DATA_RANGE } from '../design/PostprocessingTab';
import type { ViewItem } from '@/types/postprocessing';

describe('Colorbar placement', () => {
  it('positions itself absolutely on its own', () => {
    render(<Colorbar min={0} max={1} colorMap="jet" label="Current" unit="A" compact />);
    expect(screen.getByLabelText('Colour scale Current')).toHaveStyle({ position: 'absolute' });
  });

  it('is laid out by its parent when inline (several bars stack without overlap)', () => {
    render(<Colorbar min={0} max={1} colorMap="jet" label="Current" unit="A" compact inline />);
    expect(screen.getByLabelText('Colour scale Current')).toHaveStyle({ position: 'relative' });
  });
});

describe('computeAutoRange without data', () => {
  it('returns NO_DATA_RANGE, so no placeholder 0…1 scale is drawn', () => {
    const item = { id: 'd', type: 'directivity', visible: true, label: 'Directivity' } as ViewItem;
    expect(computeAutoRange(item, null, null, null, null)).toBe(NO_DATA_RANGE);
  });

  it('returns a real range when there is data', () => {
    const item = { id: 'c', type: 'current', visible: true, label: 'Current' } as ViewItem;
    const results = { branch_currents: [{ real: 0.5, imag: 0 }, { real: 2, imag: 0 }] };
    const range = computeAutoRange(item, results as never, null, null, null);
    expect(range).not.toBe(NO_DATA_RANGE);
    expect(range).toEqual({ min: 0.5, max: 2 });
  });
});
