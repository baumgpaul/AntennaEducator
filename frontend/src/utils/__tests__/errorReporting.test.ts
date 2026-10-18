import { describe, it, expect, vi, beforeEach } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/api/client', () => ({ projectsClient: { post } }));

import { _resetErrorReporting, reportClientError } from '../errorReporting';

describe('reportClientError (#78)', () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    _resetErrorReporting();
  });

  it('posts the error once, with its kind and component stack', () => {
    const err = new TypeError('x is undefined');
    reportClientError(err, 'render', '\n    at DesignPage');
    reportClientError(err, 'render', '\n    at DesignPage');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/api/client-errors',
      expect.objectContaining({
        message: 'TypeError: x is undefined',
        kind: 'render',
        component_stack: '\n    at DesignPage',
      }),
    );
  });

  it('sends at most 5 distinct reports per page load', () => {
    for (let i = 0; i < 20; i++) reportClientError(new Error(`boom ${i}`), 'error');
    expect(post).toHaveBeenCalledTimes(5);
  });

  it('never throws, even if sending fails', () => {
    post.mockImplementation(() => {
      throw new Error('network');
    });
    expect(() => reportClientError('plain string', 'unhandledrejection')).not.toThrow();
  });
});
