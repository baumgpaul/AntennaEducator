/**
 * DipoleDialog Tests — Source Configuration
 * Tests for voltage/current source toggle, amplitude, and phase fields
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { DipoleDialog } from './DipoleDialog';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('DipoleDialog — Source Configuration', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(undefined),
  };

  it('renders source type toggle with Voltage selected by default', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    const voltageBtn = screen.getByRole('button', { name: /voltage/i });
    expect(voltageBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders amplitude and phase fields', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    expect(screen.getByLabelText(/amplitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phase/i)).toBeInTheDocument();
  });

  it('defaults to amplitude=1 and phase=0', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    const amplitudeInput = screen.getByLabelText(/amplitude/i) as HTMLInputElement;
    const phaseInput = screen.getByLabelText(/phase/i) as HTMLInputElement;
    expect(amplitudeInput.value).toBe('1');
    expect(phaseInput.value).toBe('0');
  });

  it('allows switching to current source', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    const currentBtn = screen.getByRole('button', { name: /current/i });
    await user.click(currentBtn);
    expect(currentBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('allows zero amplitude (rod mode)', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    const amplitudeInput = screen.getByLabelText(/amplitude/i) as HTMLInputElement;
    // Zero amplitude should be valid (acts as passive rod)
    expect(amplitudeInput).toBeInTheDocument();
  });

  it('shows unit label matching source type — V for voltage', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    // ExpressionField renders unit in helper text (e.g. "1 V")
    expect(screen.getByText(/\bV$/)).toBeInTheDocument();
  });

  it('shows unit label A for current source', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    await user.click(screen.getByRole('button', { name: /current/i }));
    expect(screen.getByText(/\bA$/)).toBeInTheDocument();
  });

  it('passes source config to onGenerate', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
      </Provider>
    );

    // Submit with defaults
    await user.click(screen.getByRole('button', { name: /generate mesh/i }));

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });

    const callData = onGenerate.mock.calls[0][0];
    expect(callData.sourceType).toBe('voltage');
    expect(callData.sourceAmplitude).toBe(1);
    expect(callData.sourcePhase).toBe(0);
  });

  it('passes current source config when switched', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
      </Provider>
    );

    // Switch to current source
    await user.click(screen.getByRole('button', { name: /current/i }));

    // Submit
    await user.click(screen.getByRole('button', { name: /generate mesh/i }));

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });

    const callData = onGenerate.mock.calls[0][0];
    expect(callData.sourceType).toBe('current');
  });

  it('shows phase unit in degrees', () => {
    render(
      <Provider store={createTestStore()}>
        <DipoleDialog {...defaultProps} />
      </Provider>
    );
    // ExpressionField renders unit in helper text (e.g. "0 °")
    expect(screen.getByText(/°/)).toBeInTheDocument();
  });
});
