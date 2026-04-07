/**
 * UI-specific types and interfaces
 */

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: number
  message: string
  severity: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}
