import { describe, expect, it } from 'vitest';
import { formatTokens, tokensToUsd, tokenTooltip } from './tokens';

describe('token display', () => {
  it('formats balances with thousands separators', () => {
    expect(formatTokens(30000)).toBe('30,000');
    expect(formatTokens(488)).toBe('488');
    expect(formatTokens(0)).toBe('0');
  });

  it('the starter amount is worth about 50 cents', () => {
    expect(tokensToUsd(30000)).toBeCloseTo(0.5, 2);
  });

  it('explains what a token is', () => {
    expect(tokenTooltip(30000)).toMatch(/30,000 simulation tokens remaining \(≈ \$0\.50 of compute\)/);
    expect(tokenTooltip(3)).toMatch(/< \$0\.01/);
    expect(tokenTooltip(1)).toMatch(/1 token = 1 GB-second/);
  });
});
