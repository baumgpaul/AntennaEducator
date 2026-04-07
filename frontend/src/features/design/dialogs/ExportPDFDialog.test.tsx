import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ExportPDFDialog from './ExportPDFDialog';
import postprocessingReducer from '@/store/postprocessingSlice';
import solverReducer from '@/store/solverSlice';

type TestView = { id: string; name: string; viewType: string; items: [] };

function makeStore(exportPDFDialogOpen = true, views: TestView[] = []) {
  return configureStore({
    reducer: {
      postprocessing: postprocessingReducer,
      solver: solverReducer,
    },
    preloadedState: {
      postprocessing: {
        viewConfigurations: views,
        selectedViewId: views[0]?.id ?? null,
        selectedItemId: null,
        addViewDialogOpen: false,
        addAntennaDialogOpen: false,
        addFieldDialogOpen: false,
        addScalarPlotDialogOpen: false,
        scalarPlotPreselect: null,
        exportPDFDialogOpen,
        exportType: null,
      },
    },
  });
}

describe('ExportPDFDialog', () => {
  const mockOnExport = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="Test Project" onExport={mockOnExport} />
      </Provider>,
    );
    expect(screen.getByText('Export PDF Report')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(
      <Provider store={makeStore(false)}>
        <ExportPDFDialog projectName="MyProj" onExport={mockOnExport} />
      </Provider>,
    );
    expect(screen.queryByText('Include Sections')).not.toBeInTheDocument();
  });

  it('shows project name in info box', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="Dipole Lab" onExport={mockOnExport} />
      </Provider>,
    );
    expect(screen.getByText('Dipole Lab')).toBeInTheDocument();
  });

  it('shows author name when provided', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="Lab 1" authorName="Alice" onExport={mockOnExport} />
      </Provider>,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows submission chip when submissionMeta provided', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog
          projectName="Lab 1"
          submissionMeta={{
            studentName: 'Bob',
            submittedAt: '2026-01-01T00:00:00Z',
            status: 'reviewed',
          }}
          onExport={mockOnExport}
        />
      </Provider>,
    );
    expect(screen.getByText(/Submission by Bob/)).toBeInTheDocument();
  });

  it('auto-generates filename from project name', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="My Antenna Test" onExport={mockOnExport} />
      </Provider>,
    );
    const input = screen.getByLabelText(/Filename/i) as HTMLInputElement;
    expect(input.value).toBe('My_Antenna_Test_report');
  });

  it('renders all 5 section checkboxes', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog onExport={mockOnExport} />
      </Provider>,
    );
    expect(screen.getByLabelText(/Cover Page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Antenna Design Summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Solver Configuration/i)).toBeInTheDocument();
    const viewsCheckbox = screen.getByRole('checkbox', { name: /Result Views/i });
    expect(viewsCheckbox).toBeDisabled();
    expect(screen.getByLabelText(/Documentation/i)).toBeInTheDocument();
  });

  it('enables Views checkbox when views exist', () => {
    render(
      <Provider store={makeStore(true, [{ id: 'v1', name: 'View 1', viewType: '3D', items: [] }])}>
        <ExportPDFDialog onExport={mockOnExport} />
      </Provider>,
    );
    const viewsCheckbox = screen.getByRole('checkbox', { name: /Result Views/i });
    expect(viewsCheckbox).not.toBeDisabled();
  });

  it('Export button is disabled when filename is empty', () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="P" onExport={mockOnExport} />
      </Provider>,
    );
    const filenameInput = screen.getByLabelText(/Filename/i);
    fireEvent.change(filenameInput, { target: { value: '' } });
    const exportBtn = screen.getByRole('button', { name: /Export PDF/i });
    expect(exportBtn).toBeDisabled();
  });

  it('calls onExport with sections and filename', async () => {
    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="TestProj" onExport={mockOnExport} />
      </Provider>,
    );
    const input = screen.getByLabelText(/Filename/i);
    fireEvent.change(input, { target: { value: 'my_export' } });

    const exportBtn = screen.getByRole('button', { name: /Export PDF/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'my_export',
          sections: expect.objectContaining({ cover: true, antennaSummary: true }),
        }),
      );
    });
  });

  it('closes dialog on cancel', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ExportPDFDialog onExport={mockOnExport} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(store.getState().postprocessing.exportPDFDialogOpen).toBe(false);
    });
  });

  it('shows progress bar while generating', async () => {
    let resolveExport!: () => void;
    const slowExport = vi.fn(
      ({ onProgress }: { onProgress?: (m: string, c: number, t: number) => void }) =>
        new Promise<void>(resolve => {
          onProgress?.('Generating…', 1, 3);
          resolveExport = resolve;
        }),
    );

    render(
      <Provider store={makeStore()}>
        <ExportPDFDialog projectName="X" onExport={slowExport} />
      </Provider>,
    );

    const input = screen.getByLabelText(/Filename/i);
    fireEvent.change(input, { target: { value: 'x_report' } });
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    resolveExport?.();
  });
});
