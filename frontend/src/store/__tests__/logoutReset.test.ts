import { describe, it, expect, beforeEach } from 'vitest';
import { rootReducer } from '../store';
import { logoutAsync } from '../authSlice';
import { SESSION_KEYS, clearStoredSession } from '@/services/auth/session';

describe('logout (B18)', () => {
  beforeEach(() => localStorage.clear());

  it('clears every session key', () => {
    for (const key of SESSION_KEYS) localStorage.setItem(key, 'x');
    localStorage.setItem('design-left-panel-width', '300');
    clearStoredSession();
    for (const key of SESSION_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('design-left-panel-width')).toBe('300'); // preferences stay
  });

  it('resets all slices except UI preferences', () => {
    const initial = rootReducer(undefined, { type: '@@init' });
    const used = {
      ...initial,
      projects: { ...initial.projects, items: [{ id: 'p1', name: 'Previous user project' }] },
      ui: { ...initial.ui, theme: { mode: 'dark' } },
    } as typeof initial;

    const after = rootReducer(used, { type: logoutAsync.fulfilled.type });

    expect(after.projects.items).toEqual([]);
    expect(after.ui.theme.mode).toBe('dark');
    expect(after.auth.isAuthenticated).toBe(false);
  });
});
