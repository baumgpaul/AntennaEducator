import { describe, expect, it, vi } from 'vitest';
import { uniqueId } from '../ids';

describe('uniqueId', () => {
  it('starts with the prefix', () => {
    expect(uniqueId('field')).toMatch(/^field-[0-9a-z]+-[0-9a-z]+$/);
  });

  it('differs for ids made in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ids = Array.from({ length: 5 }, () => uniqueId('trace'));
    vi.restoreAllMocks();
    expect(new Set(ids).size).toBe(5);
  });
});
