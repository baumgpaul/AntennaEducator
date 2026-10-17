import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('@/api/client', () => ({ authClient: { get: getMock, post: vi.fn() } }));

import { LocalAuthService } from '../localAuth';

describe('LocalAuthService.refreshToken (B1: session survives reload)', () => {
  beforeEach(() => {
    localStorage.clear();
    getMock.mockReset();
  });

  it('keeps the stored token when the backend still accepts it', async () => {
    localStorage.setItem('auth_token', 'stored-jwt');
    getMock.mockResolvedValue({ data: { id: 'u1', email: 'a@b.com', username: 'a' } });

    const tokens = await new LocalAuthService().refreshToken();

    expect(tokens.accessToken).toBe('stored-jwt');
    expect(getMock).toHaveBeenCalledWith('/api/auth/me');
    expect(JSON.parse(localStorage.getItem('user')!).id).toBe('u1');
  });

  it('rejects when there is no stored token', async () => {
    await expect(new LocalAuthService().refreshToken()).rejects.toThrow(/No stored session/);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('rejects when the backend rejects the token (expired)', async () => {
    localStorage.setItem('auth_token', 'expired-jwt');
    getMock.mockRejectedValue(new Error('401'));

    await expect(new LocalAuthService().refreshToken()).rejects.toThrow();
  });
});
