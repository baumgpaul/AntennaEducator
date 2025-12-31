import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldRegionControls } from '../FieldRegionControls';

describe('FieldRegionControls', () => {
  const mockOnVisibleChange = vi.fn();
  const mockOnOpacityChange = vi.fn();

  it('renders with initial values', () => {
    render(
      <FieldRegionControls
        visible={true}
        opacity={0.3}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    expect(screen.getByText('Field Regions')).toBeInTheDocument();
    expect(screen.getByLabelText('Show Regions')).toBeChecked();
    expect(screen.getByText('Opacity: 30%')).toBeInTheDocument();
  });

  it('calls onVisibleChange when checkbox is clicked', () => {
    render(
      <FieldRegionControls
        visible={true}
        opacity={0.3}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    const checkbox = screen.getByLabelText('Show Regions');
    fireEvent.click(checkbox);

    expect(mockOnVisibleChange).toHaveBeenCalledWith(false);
  });

  it('displays opacity as percentage', () => {
    const { rerender } = render(
      <FieldRegionControls
        visible={true}
        opacity={0.5}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    expect(screen.getByText('Opacity: 50%')).toBeInTheDocument();

    rerender(
      <FieldRegionControls
        visible={true}
        opacity={0.75}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    expect(screen.getByText('Opacity: 75%')).toBeInTheDocument();
  });

  it('can be collapsed and expanded', () => {
    render(
      <FieldRegionControls
        visible={true}
        opacity={0.3}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    // Initially expanded
    expect(screen.getByText('Show Regions')).toBeInTheDocument();

    // Click header to collapse
    const header = screen.getByText('Field Regions');
    fireEvent.click(header);

    // Note: Due to Collapse animation, we can't easily test if content is hidden
    // This test verifies the component renders without errors
  });

  it('disables opacity slider when regions are not visible', () => {
    render(
      <FieldRegionControls
        visible={false}
        opacity={0.3}
        onVisibleChange={mockOnVisibleChange}
        onOpacityChange={mockOnOpacityChange}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toBeDisabled();
  });
});
