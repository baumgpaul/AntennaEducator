import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ResultsWorkspace, { type WorkspaceView } from '../ResultsWorkspace';

const views: WorkspaceView<'a' | 'b'>[] = [
  { id: '1', name: 'First', type: 'a' },
  { id: '2', name: 'Second', type: 'b' },
];

const setup = (selectedId: string | null = null) => {
  const handlers = { onSelect: vi.fn(), onAdd: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };
  render(
    <ResultsWorkspace
      viewTypes={[
        { type: 'a', label: 'Type A', icon: <span /> },
        { type: 'b', label: 'Type B', icon: <span /> },
      ]}
      views={views}
      selectedId={selectedId}
      renderView={(v) => <div>showing {v.name}</div>}
      renderProperties={(v) => (v.type === 'b' ? <div>props of {v.name}</div> : null)}
      {...handlers}
    />,
  );
  return handlers;
};

describe('ResultsWorkspace', () => {
  it('shows the first view when nothing is selected, without a properties panel for it', () => {
    setup();
    expect(screen.getByText('showing First')).toBeInTheDocument();
    expect(screen.queryByText('View properties')).not.toBeInTheDocument();
  });

  it('shows the selected view and its properties', () => {
    setup('2');
    expect(screen.getByText('showing Second')).toBeInTheDocument();
    expect(screen.getByText('props of Second')).toBeInTheDocument();
  });

  it('adds, selects, renames and deletes', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Type B' }));
    expect(h.onAdd).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByText('Second'));
    expect(h.onSelect).toHaveBeenCalledWith('2');
    fireEvent.click(screen.getByLabelText('Rename First'));
    const input = screen.getByDisplayValue('First');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);
    expect(h.onRename).toHaveBeenCalledWith('1', 'Renamed');
    fireEvent.click(screen.getByLabelText('Delete Second'));
    expect(h.onDelete).toHaveBeenCalledWith('2');
    expect(h.onSelect).toHaveBeenCalledTimes(1);
  });
});
