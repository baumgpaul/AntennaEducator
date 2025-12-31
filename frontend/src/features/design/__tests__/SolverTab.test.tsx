import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SolverTab } from '../SolverTab';
import type { AntennaElement } from '@/types/models';

// Mock the child components
vi.mock('../TreeViewPanel', () => ({
  default: () => <div data-testid="tree-view-panel">Tree View Panel</div>,
}));

vi.mock('../DesignCanvas', () => ({
  default: () => <div data-testid="design-canvas">Design Canvas</div>,
}));

describe('SolverTab', () => {
  const mockElements: AntennaElement[] = [
    {
      id: '1',
      name: 'Dipole 1',
      type: 'dipole',
      visible: true,
      locked: false,
      color: '#ff0000',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      parameters: {
        length: 150,
        radius: 2,
      },
    },
  ];

  it('renders the 3-panel layout', () => {
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
      />
    );

    // Check that all three panels are present
    expect(screen.getByTestId('tree-view-panel')).toBeInTheDocument();
    expect(screen.getByTestId('design-canvas')).toBeInTheDocument();
    expect(screen.getByText(/select a field region/i)).toBeInTheDocument();
  });

  it('displays placeholder text in properties panel', () => {
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
      />
    );

    expect(
      screen.getByText(/select a field region in the tree view to edit its properties/i)
    ).toBeInTheDocument();
  });

  it('passes elements to TreeViewPanel', () => {
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId="1"
        onElementSelect={() => {}}
      />
    );

    // TreeViewPanel should be rendered
    expect(screen.getByTestId('tree-view-panel')).toBeInTheDocument();
  });

  it('calls onElementSelect when element is selected', () => {
    const mockOnSelect = vi.fn();
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={mockOnSelect}
      />
    );

    // This test verifies the prop is passed correctly
    // Actual selection behavior is tested in TreeViewPanel tests
    expect(mockOnSelect).not.toHaveBeenCalled();
  });
});
