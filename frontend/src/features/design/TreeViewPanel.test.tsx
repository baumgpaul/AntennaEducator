/**
 * TreeViewPanel Tests — Dipole-specific display changes
 * - Hide mesh subtree for dipole elements
 * - Remove show/hide toggle for sources
 * - Show source value in label
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TreeViewPanel from './TreeViewPanel';
import type { AntennaElement } from '@/types/models';

const makeDipoleElement = (overrides?: Partial<AntennaElement>): AntennaElement => ({
  id: 'dipole_1',
  type: 'dipole',
  name: 'Test Dipole',
  config: { length: 0.143, wire_radius: 0.001, gap: 0.001, segments: 21 },
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  mesh: {
    nodes: [[0, 0, 0], [0, 0, 0.07], [0, 0, 0.14]],
    edges: [[0, 1], [1, 2]],
    radii: [0.001, 0.001],
  },
  sources: [
    {
      type: 'voltage',
      amplitude: { real: 1, imag: 0 },
      node_start: 1,
      node_end: 2,
      tag: 'Feed',
    },
  ],
  lumped_elements: [],
  visible: true,
  locked: false,
  color: '#FF8C00',
  ...overrides,
});

const makeLoopElement = (): AntennaElement => ({
  id: 'loop_1',
  type: 'loop',
  name: 'Test Loop',
  config: { loop_type: 'circular', radius: 0.05, wire_radius: 0.001, segments: 20 },
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  mesh: {
    nodes: [[0.05, 0, 0], [0, 0.05, 0], [-0.05, 0, 0]],
    edges: [[0, 1], [1, 2]],
    radii: [0.001, 0.001],
  },
  sources: [{ type: 'voltage', amplitude: { real: 1, imag: 0 }, tag: 'Feed' }],
  lumped_elements: [],
  visible: true,
  locked: false,
  color: '#00BCD4',
});

describe('TreeViewPanel — Dipole mesh hiding', () => {
  it('does NOT show Mesh subtree for dipole elements', () => {
    render(
      <TreeViewPanel
        elements={[makeDipoleElement()]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    expect(screen.queryByText('Mesh')).not.toBeInTheDocument();
  });

  it('still shows Mesh subtree for non-dipole elements (loop)', () => {
    render(
      <TreeViewPanel
        elements={[makeLoopElement()]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Mesh')).toBeInTheDocument();
  });
});

describe('TreeViewPanel — Source visibility toggle removed', () => {
  it('does NOT render show/hide toggle button on source nodes', () => {
    render(
      <TreeViewPanel
        elements={[makeDipoleElement()]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    // Source should be displayed
    const sourceText = screen.getByText(/voltage source/i);
    expect(sourceText).toBeInTheDocument();

    // But the source list item should NOT have a visibility toggle icon button
    const sourceItem = sourceText.closest('li');
    if (sourceItem) {
      const visIcons = within(sourceItem).queryAllByTestId(/visibility/i);
      expect(visIcons).toHaveLength(0);
    }
  });
});

describe('TreeViewPanel — Source label with value', () => {
  it('shows amplitude and phase in source label for voltage source', () => {
    render(
      <TreeViewPanel
        elements={[makeDipoleElement()]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    // Should show something like "VOLTAGE Source (1V ∠ 0°)"
    expect(screen.getByText(/VOLTAGE Source.*1.*V.*0°/)).toBeInTheDocument();
  });

  it('shows current source label with A unit', () => {
    const element = makeDipoleElement({
      sources: [
        {
          type: 'current',
          amplitude: { real: 0, imag: 0.5 },
          node_start: 1,
          node_end: 2,
          tag: 'Feed',
        },
      ],
    });
    render(
      <TreeViewPanel
        elements={[element]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/CURRENT Source.*0\.5.*A/)).toBeInTheDocument();
  });

  it('shows 0V for zero amplitude voltage source (rod mode)', () => {
    const element = makeDipoleElement({
      sources: [
        {
          type: 'voltage',
          amplitude: { real: 0, imag: 0 },
          node_start: 1,
          node_end: 2,
          tag: 'Feed',
        },
      ],
    });
    render(
      <TreeViewPanel
        elements={[element]}
        selectedElementId={null}
        onElementSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/VOLTAGE Source.*0.*V.*0°/)).toBeInTheDocument();
  });
});
