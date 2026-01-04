/**
 * Common types for authentication services
 */

import type { User } from '@/types/models'

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn?: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  username: string
  password: string
}

export interface AuthResponse {
  user: User
  tokens: AuthTokens
}

/**
 * Abstract interface for authentication providers
 * Supports both local JWT and AWS Cognito implementations
 */
export interface IAuthService {
  /**
   * Sign in with email and password
   */
  login(credentials: LoginCredentials): Promise<AuthResponse>

  /**
   * Register new user
   */
  register(data: RegisterData): Promise<AuthResponse>

  /**
   * Sign out current user
   */
  logout(): Promise<void>

  /**
   * Refresh access token
   */
  refreshToken(): Promise<AuthTokens>

  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<User>

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean

  /**
   * Get current access token
   */
  getAccessToken(): string | null

  /**
   * Password reset (optional - not all providers support)
   */
  forgotPassword?(email: string): Promise<void>

  /**
   * Confirm password reset (optional)
   */
  confirmPasswordReset?(email: string, code: string, newPassword: string): Promise<void>
}
