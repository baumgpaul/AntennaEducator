/**
 * Browser-stored session keys. Every logout path clears all of them, so a
 * shared computer keeps nothing of the previous user (B18: each path used to
 * clear a different subset, leaving id_token or user behind).
 */
export const SESSION_KEYS = ['auth_token', 'refresh_token', 'id_token', 'user'] as const;

export function clearStoredSession(): void {
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key);
  }
}
