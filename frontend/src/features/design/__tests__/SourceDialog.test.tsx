import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceDialog } from '../SourceDialog';
import type { AntennaElement } from '@/types/models';

const dipole = (id: string, nodeCount: number): AntennaElement =>
  ({
    id,
    name: `Dipole ${id}`,
    type: 'dipole',
    config: { length: 1, wire_radius: 0.001 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: {
      nodes: Array.from({ length: nodeCount }, (_, i) => [0, 0, i]),
      edges: [],
      radii: [],
    },
    visible: true,
    locked: false,
  }) as unknown as AntennaElement;

describe('SourceDialog node range (B23)', () => {
  it('is usable without a global maxNodeIndex (limit comes from the antenna)', () => {
    render(<SourceDialog open onClose={vi.fn()} onAdd={vi.fn()} elements={[dipole('a', 6)]} />);
    expect(screen.getByRole('button', { name: 'Add Source' })).toBeEnabled();
    expect(screen.queryByText(/No antenna mesh loaded/)).not.toBeInTheDocument();
  });

  it('accepts the last node and rejects one beyond it', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<SourceDialog open onClose={vi.fn()} onAdd={onAdd} elements={[dipole('a', 6)]} />);

    await user.clear(screen.getByLabelText('Node 1'));
    await user.type(screen.getByLabelText('Node 1'), '7');
    await user.click(screen.getByRole('button', { name: 'Add Source' }));

    expect(await screen.findByText('Mesh node index must be ≤ 6')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
