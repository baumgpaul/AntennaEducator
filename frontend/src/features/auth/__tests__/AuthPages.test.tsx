import { describe, it, expect, vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/login', search: '', state: null }),
}));

vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: () => ({ isAuthenticated: false, loading: false, error: null }),
}));

vi.mock('@/store/authSlice', () => ({
  loginAsync: () => ({ type: 'auth/login' }),
  registerAsync: () => ({ type: 'auth/register' }),
  clearError: () => ({ type: 'auth/clearError' }),
  selectAuth: (state: unknown) => state,
}));

describe('LoginPage', () => {
  it('exports a default component', async () => {
    const mod = await import('../LoginPage');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('RegisterPage', () => {
  it('exports a default component', async () => {
    const mod = await import('../RegisterPage');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
