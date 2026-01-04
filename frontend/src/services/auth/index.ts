/**
 * Auth Service
 * Public API for authentication operations
 * Re-exports the factory and provides convenience functions
 */

export { getAuthService, createAuthService, getAuthProvider, resetAuthService } from './factory'
export type { IAuthService, AuthProvider, LoginCredentials, RegisterData, AuthResponse, AuthTokens } from './factory'
