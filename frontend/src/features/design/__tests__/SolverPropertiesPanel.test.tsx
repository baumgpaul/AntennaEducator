import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SolverPropertiesPanel } from '../SolverPropertiesPanel';

describe('SolverPropertiesPanel', () => {
  const mockOnFieldRegionsVisibleChange = vi.fn();
  const mockOnFieldRegionOpacityChange = vi.fn();

  it('renders field region display settings', () => {
    render(
      <SolverPropertiesPanel
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.3}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    expect(screen.getByText('Field Region Display')).toBeInTheDocument();
    expect(screen.getByText('Show Field Regions')).toBeInTheDocument();
    expect(screen.getByText('Opacity: 30%')).toBeInTheDocument();
  });

  it('shows empty state when no field is selected', () => {
    render(
      <SolverPropertiesPanel
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.3}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    expect(screen.getByText('Select a field region in the tree view to edit its properties')).toBeInTheDocument();
  });

  it('shows field properties section when field is selected', () => {
    render(
      <SolverPropertiesPanel
        selectedFieldId="field-1"
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.3}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    expect(screen.getByText('Field Properties')).toBeInTheDocument();
  });

  it('calls onFieldRegionsVisibleChange when checkbox is toggled', () => {
    render(
      <SolverPropertiesPanel
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.3}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(mockOnFieldRegionsVisibleChange).toHaveBeenCalledWith(false);
  });

  it('disables opacity slider when field regions are not visible', () => {
    render(
      <SolverPropertiesPanel
        fieldRegionsVisible={false}
        fieldRegionOpacity={0.3}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toBeDisabled();
  });

  it('displays opacity value correctly', () => {
    const { rerender } = render(
      <SolverPropertiesPanel
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.5}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    expect(screen.getByText('Opacity: 50%')).toBeInTheDocument();

    rerender(
      <SolverPropertiesPanel
        fieldRegionsVisible={true}
        fieldRegionOpacity={0.75}
        onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        onFieldRegionOpacityChange={mockOnFieldRegionOpacityChange}
      />
    );

    expect(screen.getByText('Opacity: 75%')).toBeInTheDocument();
  });
});
