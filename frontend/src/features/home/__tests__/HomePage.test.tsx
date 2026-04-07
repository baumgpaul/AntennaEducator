import { describe, it, expect, vi } from 'vitest';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock store hooks
vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: unknown) => {
    if (typeof selector === 'function') return undefined;
    return undefined;
  },
}));

// Mock fetchProjects thunk
vi.mock('@/store/projectsSlice', () => ({
  fetchProjects: () => ({ type: 'projects/fetchProjects' }),
}));

describe('HomePage', () => {
  it('exports a default component', async () => {
    const mod = await import('../HomePage');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
