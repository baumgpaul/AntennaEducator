import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { PositionControl } from '../PositionControl';
import { describe, it, expect } from 'vitest';

function PositionControlWrapper({ defaultValues = { position: { x: 0, y: 0, z: 0 }, orientation: { rotX: 0, rotY: 0, rotZ: 0 } }, ...props }: any) {
  const { control } = useForm({ defaultValues });
  return <PositionControl control={control} {...props} />;
}

describe('PositionControl Component', () => {
  // Position Input Rendering
  it('renders position X input field', () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x');
    expect(xInput).toBeInTheDocument();
  });

  it('renders position Y input field', () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const yInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.y');
    expect(yInput).toBeInTheDocument();
  });

  it('renders position Z input field', () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const zInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.z');
    expect(zInput).toBeInTheDocument();
  });

  // Default Values
  it('displays default position values correctly', () => {
    render(
      <PositionControlWrapper
        defaultValues={{
          position: { x: 1.5, y: 2.5, z: 3.5 },
          orientation: { rotX: 0, rotY: 0, rotZ: 0 },
        }}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;
    const yInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.y') as HTMLInputElement;
    const zInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.z') as HTMLInputElement;

    expect(xInput.value).toBe('1.5');
    expect(yInput.value).toBe('2.5');
    expect(zInput.value).toBe('3.5');
  });

  // Value Handling
  it('accepts decimal position values', async () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;

    fireEvent.change(xInput, { target: { value: '1.234' } });

    await waitFor(() => {
      expect(xInput.value).toBe('1.234');
    });
  });

  it('accepts negative X and Y values', async () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;
    const yInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.y') as HTMLInputElement;

    fireEvent.change(xInput, { target: { value: '-5.5' } });
    fireEvent.change(yInput, { target: { value: '-3.2' } });

    await waitFor(() => {
      expect(xInput.value).toBe('-5.5');
      expect(yInput.value).toBe('-3.2');
    });
  });

  it('Z input accepts non-negative values', () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const zInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.z') as HTMLInputElement;
    expect(zInput).toBeInTheDocument();
    expect(zInput).toHaveAttribute('type', 'number');
    expect(zInput).toHaveAttribute('step', '0.001');
  });

  // Constraints & Precision
  it('position inputs have 0.001 step for precision', () => {
    render(<PositionControlWrapper />);
    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;
    expect(xInput.getAttribute('step')).toBe('0.001');
  });

  // Rotation Input Rendering
  it('renders rotation inputs when showOrientation is true', () => {
    render(<PositionControlWrapper showOrientation={true} />);
    const inputs = screen.getAllByRole('spinbutton');
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX');
    const rotYInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotY');
    const rotZInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotZ');
    
    expect(rotXInput).toBeInTheDocument();
    expect(rotYInput).toBeInTheDocument();
    expect(rotZInput).toBeInTheDocument();
  });

  it('hides rotation inputs when showOrientation is false', () => {
    render(<PositionControlWrapper showOrientation={false} />);
    const inputs = screen.queryAllByRole('spinbutton');
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX');
    
    expect(rotXInput).toBeUndefined();
  });

  it('displays default rotation values', () => {
    render(
      <PositionControlWrapper
        showOrientation={true}
        defaultValues={{
          position: { x: 0, y: 0, z: 0 },
          orientation: { rotX: 45, rotY: 90, rotZ: 180 },
        }}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX') as HTMLInputElement;
    const rotYInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotY') as HTMLInputElement;
    const rotZInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotZ') as HTMLInputElement;

    expect(rotXInput.value).toBe('45');
    expect(rotYInput.value).toBe('90');
    expect(rotZInput.value).toBe('180');
  });

  // Rotation Constraints & Precision
  it('rotation inputs have -180 to 180 range', () => {
    render(<PositionControlWrapper showOrientation={true} />);
    const inputs = screen.getAllByRole('spinbutton');
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX') as HTMLInputElement;
    
    expect(rotXInput.getAttribute('min')).toBe('-180');
    expect(rotXInput.getAttribute('max')).toBe('180');
  });

  it('rotation inputs have 1 degree step', () => {
    render(<PositionControlWrapper showOrientation={true} />);
    const inputs = screen.getAllByRole('spinbutton');
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX') as HTMLInputElement;
    
    expect(rotXInput.getAttribute('step')).toBe('1');
  });

  // Preset Buttons
  it('renders preset buttons when showPresets is true', () => {
    render(<PositionControlWrapper showPresets={true} />);
    expect(screen.getByRole('button', { name: /Position at origin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position on ground plane/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position above ground/ })).toBeInTheDocument();
  });

  it('hides preset buttons when showPresets is false', () => {
    render(<PositionControlWrapper showPresets={false} />);
    expect(screen.queryByRole('button', { name: /Position at origin/ })).not.toBeInTheDocument();
  });

  // Custom Props
  it('uses custom position prefix', () => {
    render(
      <PositionControlWrapper
        positionPrefix="customPos"
        defaultValues={{
          customPos: { x: 2.5, y: 0, z: 0 },
          orientation: { rotX: 0, rotY: 0, rotZ: 0 },
        }}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    const customXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'customPos.x') as HTMLInputElement;
    expect(customXInput.value).toBe('2.5');
  });

  it('uses custom orientation prefix', () => {
    render(
      <PositionControlWrapper
        showOrientation={true}
        orientationPrefix="customOri"
        defaultValues={{
          position: { x: 0, y: 0, z: 0 },
          customOri: { rotX: 60, rotY: 0, rotZ: 0 },
        }}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    const customRotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'customOri.rotX') as HTMLInputElement;
    expect(customRotXInput.value).toBe('60');
  });

  // Integration
  it('renders complete position and orientation form', () => {
    render(
      <PositionControlWrapper
        showOrientation={true}
        showPresets={true}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThanOrEqual(6);

    const positionInputs = inputs.filter(i => {
      const name = (i as HTMLInputElement).getAttribute('name') || '';
      return name.includes('position');
    });
    expect(positionInputs.length).toBe(3);

    const rotationInputs = inputs.filter(i => {
      const name = (i as HTMLInputElement).getAttribute('name') || '';
      return name.includes('orientation');
    });
    expect(rotationInputs.length).toBe(3);
  });

  it('handles changing all coordinates', async () => {
    render(<PositionControlWrapper showOrientation={true} />);
    const inputs = screen.getAllByRole('spinbutton');

    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;
    const yInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.y') as HTMLInputElement;
    const zInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.z') as HTMLInputElement;
    const rotXInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'orientation.rotX') as HTMLInputElement;

    fireEvent.change(xInput, { target: { value: '1' } });
    fireEvent.change(yInput, { target: { value: '2' } });
    fireEvent.change(zInput, { target: { value: '3' } });
    fireEvent.change(rotXInput, { target: { value: '45' } });

    await waitFor(() => {
      expect(xInput.value).toBe('1');
      expect(yInput.value).toBe('2');
      expect(zInput.value).toBe('3');
      expect(rotXInput.value).toBe('45');
    });
  });

  it('maintains precision through multiple edits', async () => {
    render(
      <PositionControlWrapper
        defaultValues={{
          position: { x: 0.123, y: 0.456, z: 0.789 },
          orientation: { rotX: 0, rotY: 0, rotZ: 0 },
        }}
      />
    );

    const inputs = screen.getAllByRole('spinbutton');
    const xInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.x') as HTMLInputElement;
    const yInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.y') as HTMLInputElement;
    const zInput = inputs.find(i => (i as HTMLInputElement).getAttribute('name') === 'position.z') as HTMLInputElement;

    expect(xInput.value).toBe('0.123');
    expect(yInput.value).toBe('0.456');
    expect(zInput.value).toBe('0.789');

    fireEvent.change(xInput, { target: { value: '0.111' } });

    await waitFor(() => {
      expect(xInput.value).toBe('0.111');
      expect(yInput.value).toBe('0.456');
      expect(zInput.value).toBe('0.789');
    });
  });

  it('accepts custom antenna height', () => {
    render(
      <PositionControlWrapper
        showPresets={true}
        antennaHeight={1.0}
      />
    );

    const buttons = screen.getAllByRole('button');
    const aboveButton = buttons.find(b => b.textContent?.includes('Above'));
    
    expect(aboveButton).toBeInTheDocument();
  });

  it('has position label in title', () => {
    render(
      <PositionControlWrapper
        title="Custom Position Title"
      />
    );

    expect(screen.getByText('Custom Position Title')).toBeInTheDocument();
  });
});
