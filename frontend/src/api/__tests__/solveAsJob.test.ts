import { describe, it, expect, vi, beforeEach } from 'vitest';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../client', () => ({
  solverClient: { post, get },
  handleApiResponse: (r: { data: unknown }) => r.data,
}));

import { solveAsJob } from '../solver';

const request = { frequency: 3e8, antennas: [] };
const fast = { pollMs: [1], timeoutMs: 1000 };

describe('solveAsJob (#77)', () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: { job_id: 'j1' } });
    get.mockReset();
  });

  it('submits once and polls until the result is there', async () => {
    get
      .mockResolvedValueOnce({ data: { status: 'queued' } })
      .mockResolvedValueOnce({ data: { status: 'running' } })
      .mockResolvedValueOnce({ data: { status: 'done', result: { frequency: 3e8 } } });
    await expect(solveAsJob(request, fast)).resolves.toEqual({ frequency: 3e8 });
    expect(post).toHaveBeenCalledWith('/api/jobs/solve', request);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledWith('/api/jobs/j1');
  });

  it("surfaces the worker's error", async () => {
    get.mockResolvedValue({ data: { status: 'failed', error: 'At least 1 antenna required' } });
    await expect(solveAsJob(request, fast)).rejects.toThrow('At least 1 antenna required');
  });

  it('gives up after the timeout', async () => {
    get.mockResolvedValue({ data: { status: 'running' } });
    await expect(solveAsJob(request, { pollMs: [5], timeoutMs: 20 })).rejects.toThrow(/did not finish/);
  });
});
