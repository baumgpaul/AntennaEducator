import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ExportPDFDialog from './ExportPDFDialog';
import postprocessingReducer from '@/store/postprocessingSlice';
import solverReducer from '@/store/solverSlice';

describe('ExportPDFDialog', () => {
  let store: ReturnType<typeof configureStore>;
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        solver: solverReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [
            { id: 'view1', name: 'Test View', viewType: '3D', items: [] },
          ],
          selectedViewId: 'view1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaDialogOpen: false,
          addFieldDialogOpen: false,
          addScalarPlotDialogOpen: false,
          scalarPlotPreselect: null,
          exportPDFDialogOpen: true,
          exportType: null,
        },
      },
    });
  });

  const renderDialog = () => {
    return render(
      <Provider store={store}>
        <ExportPDFDialog projectName="Test Project" onExport={mockOnExport} />
      </Provider>
    );
  };

  it('renders dialog when open', () => {
    renderDialog();
    expect(screen.getByText('Export View to PDF')).toBeInTheDocument();
    expect(screen.getByLabelText(/Include metadata/i)).toBeInTheDocument();
  });

  it('shows auto-generated filename from view name', () => {
    renderDialog();
    const filenameInput = screen.getByLabelText(/Filename/i) as HTMLInputElement;
    expect(filenameInput.value).toBe('Test_View');
  });

  it('validates filename is required', async () => {
    renderDialog();

    const filenameInput = screen.getByLabelText(/Filename/i);
    fireEvent.change(filenameInput, { target: { value: '' } });

    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockOnExport).not.toHaveBeenCalled();
    });
  });

  it('calls onExport with correct options', async () => {
    renderDialog();

    const metadataCheckbox = screen.getByLabelText(/Include metadata/i);
    fireEvent.click(metadataCheckbox);

    const resolutionSelect = screen.getByRole('combobox');
    fireEvent.mouseDown(resolutionSelect);
    const options = await screen.findAllByRole('option');
    const option1440p = options.find(o => o.textContent?.includes('1440p'));
    fireEvent.click(option1440p!);

    const filenameInput = screen.getByLabelText(/Filename/i);
    fireEvent.change(filenameInput, { target: { value: 'MyExport' } });

    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith({
        includeMetadata: false,
        resolution: '1440p',
        filename: 'MyExport.pdf',
      });
    });
  });

  it('closes dialog on cancel', async () => {
    renderDialog();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      const state = store.getState();
      expect(state.postprocessing.exportPDFDialogOpen).toBe(false);
    });
  });
});
