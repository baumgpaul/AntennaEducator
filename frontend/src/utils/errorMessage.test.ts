import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

const axiosError = (status: number, detail: unknown) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data: { detail } },
});

describe('errorMessage', () => {
  it('passes a thunk rejection (unwrap() throws the rejectWithValue string) through', () => {
    expect(errorMessage('Gap must be less than total length', 'Failed')).toBe('Gap must be less than total length');
  });

  it('shows the server detail instead of the generic axios text', () => {
    expect(errorMessage(axiosError(400, 'Gap must be less than total length'), 'Failed')).toBe(
      'Gap must be less than total length',
    );
  });

  it('spells out a 402 token error with need/have', () => {
    const e = axiosError(402, { message: 'Insufficient simulation tokens', required: 1, balance: 0 });
    expect(errorMessage(e, 'Failed')).toBe('Insufficient simulation tokens (need 1, have 0)');
  });

  it('uses a structured message without token fields as is', () => {
    expect(errorMessage(axiosError(409, { message: 'Already exists' }), 'Failed')).toBe('Already exists');
  });

  it('falls back to the error message, then to the fallback', () => {
    expect(errorMessage(new Error('Network Error'), 'Failed')).toBe('Network Error');
    expect(errorMessage(axiosError(500, undefined), 'Failed')).toBe('Request failed with status code 500');
    expect(errorMessage(undefined, 'Failed')).toBe('Failed');
    expect(errorMessage('', 'Failed')).toBe('Failed');
    expect(errorMessage(new Error(''), 'Failed')).toBe('Failed');
  });
});
