import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ExportPDFDialog from './ExportPDFDialog';
import postprocessingReducer from '@/store/postprocessingSlice';

describe('ExportPDFDialog', () => {
  let store: ReturnType<typeof configureStore>;
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [
            { id: 'view1', name: 'Test View', viewType: '3D', items: [] },
          ],
          selectedViewId: 'view1',
          selectedItemId: null,
          exportPDFDialogOpen: true,
          addViewDialogOpen: false,
          addAntennaElementDialogOpen: false,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: false,
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
    expect(screen.getByText('Export to PDF')).toBeInTheDocument();
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

    const resolutionSelect = screen.getByLabelText(/Resolution/i);
    fireEvent.mouseDown(resolutionSelect);
    const option1440p = await screen.findByText('1440p (2560×1440)');
    fireEvent.click(option1440p);

    const filenameInput = screen.getByLabelText(/Filename/i);
    fireEvent.change(filenameInput, { target: { value: 'MyExport' } });

    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith({
        includeMetadata: true,
        resolution: '1440p',
        filename: 'MyExport',
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
