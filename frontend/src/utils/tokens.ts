/**
 * Simulation tokens are metered compute: 1 token = 1 GB-second of cloud compute
 * (backend/common/auth/token_costs.py). The starter amount, 30 000 tokens, is
 * about $0.50; a typical solve uses a few tokens.
 */

/** Balance with thousands separators: 30000 → "30,000". */
export function formatTokens(tokens: number): string {
  return Math.round(tokens).toLocaleString('en-US');
}

/** Approximate value of a balance in US dollars of compute. */
export function tokensToUsd(tokens: number): number {
  return tokens * 0.0000166667;
}

/** Header tooltip: balance, what a token is, and roughly what it is worth. */
export function tokenTooltip(tokens: number): string {
  const usd = tokensToUsd(tokens);
  const worth = usd >= 0.01 ? `≈ $${usd.toFixed(2)}` : '< $0.01';
  return `${formatTokens(tokens)} simulation tokens remaining (${worth} of compute). 1 token = 1 GB-second of compute time; a typical solve uses a few tokens.`;
}
