import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// The build flag is on in FEM builds; the role rule stays the real one
vi.mock('@/config/features', async () => {
  const { hasRole } = await import('@/features/auth/RequireRole');
  return { FEATURE_FEM: true, canUseFem: (u: never) => hasRole(u, 'maintainer') };
});
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import { projectPath } from '@/utils/projectPath';
import { modelFromProject } from '../useFemStudio';
import { EMPTY_MODEL, TEMPLATES } from '../model';
import FemMethodPicker from '../FemMethodPicker';

describe('projects by method', () => {
  it('open in the designer or in FEM Studio', () => {
    expect(projectPath({ id: 'p1', kind: 'fem' })).toBe('/project/p1/fem');
    expect(projectPath({ id: 'p2', kind: 'peec' })).toBe('/project/p2/design');
    expect(projectPath({ id: 'p3' })).toBe('/project/p3/design'); // old projects have no kind
  });

  it('a project design_state becomes the model; anything else starts empty', () => {
    const coax = TEMPLATES[1].model;
    expect(modelFromProject(coax, 'Mine').shapes).toEqual(coax.shapes);
    expect(modelFromProject(coax, 'Mine').name).toBe('Mine');
    expect(modelFromProject({}, 'New')).toEqual({ ...EMPTY_MODEL, name: 'New' });
    expect(modelFromProject({ elements: [] }, 'Antenna')).toEqual({ ...EMPTY_MODEL, name: 'Antenna' });
  });
});

describe('FemMethodPicker', () => {
  function renderPicker(role: string, onChange = vi.fn()) {
    const store = configureStore({
      reducer: { auth: authReducer },
      preloadedState: { auth: { ...authReducer(undefined, { type: '' }), user: { id: 'u', email: 'u@x.example', role } } } as never,
    });
    render(
      <Provider store={store}>
        <FemMethodPicker value={{ kind: 'peec', template: 'coax' }} onChange={onChange} />
      </Provider>,
    );
    return onChange;
  }

  it('offers FEM to maintainers and hands over the template model', () => {
    const onChange = renderPicker('maintainer');
    expect(screen.getByText(/Antenna \(PEEC\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Field problem \(FEM/));
    const choice = onChange.mock.calls[0][0];
    expect(choice.kind).toBe('fem');
    expect(choice.design_state.shapes.map((s: { name: string }) => s.name)).toEqual(['dielectric', 'inner']);
  });

  it('shows nothing to students', () => {
    renderPicker('user');
    expect(screen.queryByText(/Field problem/)).toBeNull();
  });
});
