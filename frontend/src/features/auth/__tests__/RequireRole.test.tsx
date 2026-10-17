import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import RequireRole, { hasRole, effectiveRole } from '../RequireRole';
import type { User } from '@/types/models';

const baseUser: User = {
  id: 'u1',
  email: 'u@example.com',
  username: 'u',
  is_approved: true,
  is_admin: false,
  created_at: '2026-01-01T00:00:00Z',
};

function renderAdminRoute(user: User | null) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { ...authReducer(undefined, { type: 'init' }), user, isAuthenticated: !!user },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route
            path="/admin"
            element={
              <RequireRole role="admin">
                <div>Admin Area</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('RequireRole (B2)', () => {
  it('renders the page for admins', () => {
    renderAdminRoute({ ...baseUser, role: 'admin' });
    expect(screen.getByText('Admin Area')).toBeInTheDocument();
  });

  it('redirects regular users to home', () => {
    renderAdminRoute({ ...baseUser, role: 'user' });
    expect(screen.queryByText('Admin Area')).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('redirects maintainers away from admin-only pages', () => {
    renderAdminRoute({ ...baseUser, role: 'maintainer' });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('does not trust a stale is_admin flag when role says user', () => {
    renderAdminRoute({ ...baseUser, role: 'user', is_admin: true });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});

describe('hasRole / effectiveRole', () => {
  it('falls back to is_admin only when role is missing', () => {
    expect(effectiveRole({ ...baseUser, is_admin: true })).toBe('admin');
    expect(effectiveRole({ ...baseUser })).toBe('user');
    expect(effectiveRole(null)).toBeNull();
  });

  it('treats admin as having maintainer rights', () => {
    expect(hasRole({ ...baseUser, role: 'admin' }, 'maintainer')).toBe(true);
    expect(hasRole({ ...baseUser, role: 'maintainer' }, 'maintainer')).toBe(true);
    expect(hasRole({ ...baseUser, role: 'user' }, 'maintainer')).toBe(false);
  });
});
