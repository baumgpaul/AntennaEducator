import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import ProtectedRoute from '../ProtectedRoute';
import type { User } from '@/types/models';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('@/services/auth', () => ({
  getAuthService: () => ({ getCurrentUser, logout: vi.fn(), getAccessToken: () => null }),
}));

const pendingUser: User = {
  id: 'u1',
  email: 'student@example.com',
  username: 'student',
  is_approved: false,
  is_admin: false,
  created_at: '2026-01-01T00:00:00Z',
};

function renderProtected(user: User) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        ...authReducer(undefined, { type: 'init' }),
        user,
        isAuthenticated: true,
        sessionValidated: true,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>App Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('Admin approval gate', () => {
  beforeEach(() => getCurrentUser.mockReset());

  it('shows the waiting screen instead of the app for pending accounts', () => {
    renderProtected(pendingUser);
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('shows the app for approved accounts', () => {
    renderProtected({ ...pendingUser, is_approved: true });
    expect(screen.getByText('App Content')).toBeInTheDocument();
  });

  it('"Check again" lets the user in once approved', async () => {
    getCurrentUser.mockResolvedValue({ ...pendingUser, is_approved: true });
    renderProtected(pendingUser);

    await userEvent.click(screen.getByRole('button', { name: /check again/i }));

    expect(await screen.findByText('App Content')).toBeInTheDocument();
  });

  it('"Check again" keeps waiting while still pending', async () => {
    getCurrentUser.mockResolvedValue(pendingUser);
    renderProtected(pendingUser);

    await userEvent.click(screen.getByRole('button', { name: /check again/i }));

    expect(await screen.findByText(/Not approved yet/)).toBeInTheDocument();
  });
});
