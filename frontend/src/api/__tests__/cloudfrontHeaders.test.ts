/**
 * Requests carry the token in X-Access-Token (CloudFront OAC overwrites
 * Authorization) and, behind CloudFront, the SHA-256 of their body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';

async function captureRequest(behindCloudFront: boolean, body?: unknown) {
  vi.resetModules();
  vi.stubEnv('VITE_API_BEHIND_CLOUDFRONT', behindCloudFront ? 'true' : 'false');
  const { solverClient } = await import('../client');
  let seen: InternalAxiosRequestConfig | undefined;
  solverClient.defaults.adapter = async (config) => {
    seen = config;
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
  await (body === undefined ? solverClient.get('/health') : solverClient.post('/api/x', body));
  return seen!;
}

describe('API client headers', () => {
  beforeEach(() => localStorage.setItem('auth_token', 'tok-123'));
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('sends the token as Bearer and as X-Access-Token', async () => {
    const config = await captureRequest(false);
    expect(config.headers.Authorization).toBe('Bearer tok-123');
    expect(config.headers['X-Access-Token']).toBe('tok-123');
  });

  it('adds the body SHA-256 behind CloudFront', async () => {
    const config = await captureRequest(true, { a: 1 });
    // sha256('{"a":1}')
    expect(config.headers['x-amz-content-sha256']).toBe(
      '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    );
    expect(config.data).toBe('{"a":1}');
  });

  it('does not hash bodies when talking to the Lambda URLs directly', async () => {
    const config = await captureRequest(false, { a: 1 });
    expect(config.headers['x-amz-content-sha256']).toBeUndefined();
  });
});
