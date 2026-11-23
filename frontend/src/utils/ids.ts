let counter = 0;

/**
 * Client-side id for things the user creates (field regions, plot traces, …).
 * Timestamp plus a per-session counter, so ids made in the same millisecond differ.
 */
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
