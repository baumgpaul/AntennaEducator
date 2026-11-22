import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const { createProjectApi } = vi.hoisted(() => ({ createProjectApi: vi.fn() }));
vi.mock('@/api/projects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createProject: createProjectApi,
}));

import projectsReducer from '@/store/projectsSlice';
import uiReducer from '@/store/uiSlice';
import NewProjectDialog from './NewProjectDialog';

describe('NewProjectDialog', () => {
  it('opens the new project after creating it', async () => {
    createProjectApi.mockResolvedValue({ id: 'new-1', name: 'Dipole lab', kind: 'peec' });
    const store = configureStore({ reducer: { projects: projectsReducer, ui: uiReducer } });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route path="/projects" element={<NewProjectDialog open onClose={vi.fn()} />} />
            <Route path="/project/:id/design" element={<div>Designer page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await userEvent.type(screen.getByLabelText(/Project Name/i), 'Dipole lab');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Designer page')).toBeInTheDocument();
    expect(createProjectApi).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dipole lab' }));
  });
});
