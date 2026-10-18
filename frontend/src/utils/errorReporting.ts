/**
 * Send uncaught frontend errors to the backend log (#78).
 *
 * At most MAX_REPORTS distinct errors per page load, so a render loop cannot
 * flood the API. Reporting never throws and never reports its own failures.
 */
import { projectsClient } from '@/api/client';

const MAX_REPORTS = 5;
const sent = new Set<string>();

export type ClientErrorKind = 'render' | 'error' | 'unhandledrejection';

function clip(value: string | undefined | null, max: number): string | undefined {
  return value ? value.slice(0, max) : undefined;
}

export function reportClientError(
  error: unknown,
  kind: ClientErrorKind,
  componentStack?: string | null,
): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${kind}:${err.message}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS) return;
    sent.add(key);
    void projectsClient
      .post('/api/client-errors', {
        message: clip(`${err.name}: ${err.message}`, 1000),
        stack: clip(err.stack, 8000),
        component_stack: clip(componentStack, 8000),
        url: clip(window.location.pathname, 500),
        user_agent: clip(navigator.userAgent, 500),
        kind,
      })
      .catch(() => undefined);
  } catch {
    // never let error reporting cause an error
  }
}

/** Report errors that no React error boundary catches. Call once at startup. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => reportClientError(event.error ?? event.message, 'error'));
  window.addEventListener('unhandledrejection', (event) =>
    reportClientError(event.reason, 'unhandledrejection'),
  );
}

/** Test hook: forget what was sent. */
export function _resetErrorReporting(): void {
  sent.clear();
}
