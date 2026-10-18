import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewControls from '../ViewControls';

describe('ViewControls view options (B37)', () => {
  it('offers front/side/top presets and reports the chosen one', async () => {
    const onViewPreset = vi.fn();
    render(<ViewControls onViewPreset={onViewPreset} />);
    await userEvent.click(screen.getByRole('button', { name: 'Top view (XY plane)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Front view (XZ plane)' }));
    expect(onViewPreset.mock.calls).toEqual([['top'], ['front']]);
  });

  it('toggles the camera projection', async () => {
    const onToggleCameraMode = vi.fn();
    render(<ViewControls onToggleCameraMode={onToggleCameraMode} cameraMode="perspective" />);
    await userEvent.click(screen.getByRole('button', { name: 'Toggle camera projection' }));
    expect(onToggleCameraMode).toHaveBeenCalledTimes(1);
  });

  it('hides the new buttons when no handlers are given', () => {
    render(<ViewControls />);
    expect(screen.queryByRole('button', { name: /view \(/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle camera projection' })).not.toBeInTheDocument();
  });
});
