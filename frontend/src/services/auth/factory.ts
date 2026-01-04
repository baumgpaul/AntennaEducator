/**
 * Authentication Service Factory
 * Creates appropriate auth service based on environment configuration
 */

import type { IAuthService } from './types'
import { CognitoAuthService } from './cognitoAuth'
import { LocalAuthService } from './localAuth'

export type AuthProvider = 'cognito' | 'local'

/**
 * Get the configured auth provider from environment
 */
export function getAuthProvider(): AuthProvider {
  const provider = import.meta.env.VITE_AUTH_PROVIDER as AuthProvider
  return provider || 'local' // Default to local if not specified
}

/**
 * Create auth service instance based on provider
 */
export function createAuthService(provider?: AuthProvider): IAuthService {
  const authProvider = provider || getAuthProvider()

  switch (authProvider) {
    case 'cognito':
      return new CognitoAuthService()
    case 'local':
      return new LocalAuthService()
    default:
      console.warn(`Unknown auth provider: ${authProvider}, falling back to local`)
      return new LocalAuthService()
  }
}

/**
 * Singleton auth service instance
 */
let authServiceInstance: IAuthService | null = null

/**
 * Get or create the singleton auth service instance
 */
export function getAuthService(): IAuthService {
  if (!authServiceInstance) {
    authServiceInstance = createAuthService()
  }
  return authServiceInstance
}

/**
 * Reset auth service instance (useful for testing or switching providers)
 */
export function resetAuthService(): void {
  authServiceInstance = null
}

// Export specific types to avoid conflicts
export type { IAuthService }
export type { LoginCredentials, RegisterData, AuthResponse, AuthTokens } from './types'

