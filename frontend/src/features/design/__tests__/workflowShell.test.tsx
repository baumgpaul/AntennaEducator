/**
 * The antenna workflow in the shared shell: step status rules, and the
 * circuit editor embedded in the Circuit tab (Apply / Revert / unsaved).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import type { AntennaElement } from '@/types/models';
import { stepStatuses } from '@/features/workflow/steps';
import { CircuitEditor } from '../circuit/CircuitEditor';
import CircuitTab from '../CircuitTab';
import { PEEC_STEPS, peecProgress } from '../peecSteps';

const source = { type: 'voltage', amplitude: { real: 1, imag: 0 }, node_start: 0, node_end: 1 };
const statuses = (snap: Parameters<typeof peecProgress>[0]) => {
  const p = peecProgress(snap);
  return { ...stepStatuses(PEEC_STEPS, p.done, p.attention), notes: p.notes };
};

describe('antenna workflow steps', () => {
  it('an empty project: designer to do, everything else locked', () => {
    const s = statuses({ elements: [], solved: false, resultsStale: false, viewCount: 0 });
    expect([s.designer, s.circuit, s.solver, s.postprocessing]).toEqual(['todo', 'locked', 'locked', 'locked']);
  });

  it('an antenna without a source: the Circuit step says why', () => {
    const s = statuses({ elements: [{ sources: [] }], solved: false, resultsStale: false, viewCount: 0 });
    expect(s.designer).toBe('done');
    expect(s.circuit).toBe('attention');
    expect(s.notes.circuit?.[0]).toMatch(/No source/);
    expect(s.solver).toBe('locked');
  });

  it('solved: postprocessing opens; out-of-date results stay viewable but flagged', () => {
    const fed = [{ sources: [source] }];
    const solved = statuses({ elements: fed, solved: true, resultsStale: false, viewCount: 0 });
    expect([solved.circuit, solved.solver, solved.postprocessing]).toEqual(['done', 'done', 'todo']);
    const stale = statuses({ elements: fed, solved: true, resultsStale: true, viewCount: 2 });
    expect(stale.solver).toBe('attention');
    expect(stale.notes.solver?.[0]).toMatch(/out of date/);
    expect(stale.postprocessing).toBe('done');
  });

  it('every step has a Learn text', () => {
    PEEC_STEPS.forEach((s) => expect(s.learn.length).toBeGreaterThan(0));
  });
});

const element: AntennaElement = {
  id: 'e1',
  name: 'Dipole 1',
  type: 'dipole',
  config: {},
  mesh: null,
  sources: [],
  lumped_elements: [],
  appended_nodes: [],
  color: '#f00',
} as unknown as AntennaElement;

const store = () => configureStore({ reducer: { variables: variablesReducer } });

describe('circuit editor in the Circuit tab', () => {
  it('stays open after Apply; Revert goes back to what was applied', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <Provider store={store()}>
        <CircuitEditor variant="inline" open onClose={onClose} onApply={onApply} element={element} terminalNodeIndices={[1, 2]} />
      </Provider>,
    );
    expect(screen.getByTestId('circuit-editor-inline')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.getByRole('button', { name: /Apply/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Add Aux Node/ }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Revert/ }));
    expect(screen.queryByText('Unsaved changes')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add Aux Node/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apply/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].appended_nodes).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('read-only previews have no Apply', () => {
    render(
      <Provider store={store()}>
        <CircuitEditor variant="inline" open readOnly onClose={vi.fn()} onApply={vi.fn()} element={element} terminalNodeIndices={[]} />
      </Provider>,
    );
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
  });

  it('the tab lists the antennas with their sources and edits the selected one', () => {
    const onSelect = vi.fn();
    const fed = { ...element, id: 'e2', name: 'Fed dipole', sources: [source] } as unknown as AntennaElement;
    render(
      <Provider store={store()}>
        <CircuitTab
          elements={[element, fed]}
          selectedElementId={null}
          onSelect={onSelect}
          onApply={vi.fn()}
          terminalNodeIndices={() => []}
        />
      </Provider>,
    );
    expect(screen.getByText('no source')).toBeInTheDocument();
    expect(screen.getByText('1 source')).toBeInTheDocument();
    expect(screen.getByText(/Select an antenna on the left/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fed dipole'));
    expect(onSelect).toHaveBeenCalledWith('e2');
  });
});
