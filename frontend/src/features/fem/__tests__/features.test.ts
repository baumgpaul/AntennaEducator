import { describe, it, expect, vi, afterEach } from 'vitest';
import type { User } from '@/types/models';

const user = (role: 'user' | 'maintainer' | 'admin') => ({ id: 'u', email: 'u@x.example', role }) as unknown as User;

async function load(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_FEATURE_FEM', flag as string);
  return import('@/config/features');
}

describe('FEM feature flag', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off unless the build enables it, for everyone', async () => {
    const { FEATURE_FEM, canUseFem } = await load(undefined);
    expect(FEATURE_FEM).toBe(false);
    expect(canUseFem(user('admin'))).toBe(false);
  });

  it('with the flag: maintainers and admins only (preview)', async () => {
    const { canUseFem } = await load('true');
    expect(canUseFem(user('admin'))).toBe(true);
    expect(canUseFem(user('maintainer'))).toBe(true);
    expect(canUseFem(user('user'))).toBe(false);
    expect(canUseFem(null)).toBe(false);
  });
});
