/**
 * Helper functions for solver API
 * Converts between legacy single-antenna and new multi-antenna formats
 */

// Re-export canonical complex number utilities so existing importers are unaffected.
export {
  parseComplex,
  complexMagnitude,
  complexPhaseDeg as complexPhase,
  formatComplex,
} from '@/utils/complexNumber'
