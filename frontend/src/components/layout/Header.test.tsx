import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('@/services/auth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAuthService: () => ({ getCurrentUser, getAccessToken: () => null }),
}));

import authReducer from '@/store/authSlice';
import uiReducer from '@/store/uiSlice';
import projectsReducer from '@/store/projectsSlice';
import Header from './Header';

const cachedUser = { id: 'u1', email: 'a@uni.example', username: 'ada', simulation_tokens: 500 };

function renderHeader() {
  const store = configureStore({
    reducer: { auth: authReducer, ui: uiReducer, projects: projectsReducer },
    preloadedState: {
      auth: { ...authReducer(undefined, { type: 'init' }), user: cachedUser as never, isAuthenticated: true },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Header token balance', () => {
  it('replaces the balance cached at login with the current one on load', async () => {
    getCurrentUser.mockResolvedValue({ ...cachedUser, simulation_tokens: 488 });
    renderHeader();
    expect(await screen.findByText('488')).toBeInTheDocument();
    expect(getCurrentUser).toHaveBeenCalled();
  });
});
