import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IconButton } from '@mui/material';
import { CollapsibleSection, PanelSection } from '../Workspace';

describe('panel sections', () => {
  it('a collapsible section opens and closes on its header', () => {
    render(
      <CollapsibleSection title="Variables">
        <div>freq</div>
      </CollapsibleSection>,
    );
    const header = screen.getByRole('button', { name: 'Variables' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('its action works without opening or closing it, and is not a button inside a button', () => {
    const add = vi.fn();
    render(
      <CollapsibleSection
        title="Parameters"
        action={
          <IconButton aria-label="Add a parameter" onClick={add}>
            +
          </IconButton>
        }
      >
        <div>a = 1</div>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add a parameter' }));
    expect(add).toHaveBeenCalledTimes(1);
    const header = screen.getByText('Parameters').closest('[aria-expanded]')!;
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(header.tagName).toBe('DIV');
    expect(document.querySelector('button button')).toBeNull();
  });

  it('a header bar shows status next to the title and actions at the end', () => {
    render(<PanelSection title="Requested Quantities" extra={<span>Outdated</span>} action={<button>add</button>} />);
    const bar = screen.getByText('Requested Quantities').parentElement!;
    expect([...bar.children].map((c) => c.textContent)).toEqual(['Requested Quantities', 'Outdated', 'add']);
  });
});
