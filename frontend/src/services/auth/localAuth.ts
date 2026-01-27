/**
 * Local JWT Authentication Service
 * Wraps existing local auth API for Docker/local development
 */

import { apiClient } from '@/api/client'
import type { IAuthService, LoginCredentials, RegisterData, AuthResponse, AuthTokens } from './types'
import type { User } from '@/types/models'

export class LocalAuthService implements IAuthService {
  /**
   * Sign in with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Backend returns: {access_token, token_type, expires_in}
      const response = await apiClient.post<{
        access_token: string
        token_type: string
        expires_in?: number
      }>('/api/v1/auth/login', credentials)

      const { access_token } = response.data

      // Store token in localStorage
      localStorage.setItem('auth_token', access_token)

      // Fetch user details using the token
      const userResponse = await apiClient.get<User>('/api/v1/users/me')
      const user = userResponse.data

      // Store user in localStorage for session persistence
      localStorage.setItem('user', JSON.stringify(user))

      return {
        user,
        tokens: {
          accessToken: access_token,
          refreshToken: undefined,
        },
      }
    } catch (error: any) {
      // Handle specific error cases
      if (error.response?.status === 403) {
        throw new Error('Account pending admin approval. Please wait for approval.')
      }
      if (error.response?.status === 401) {
        throw new Error('Incorrect email or password')
      }
      throw error
    }
  }

  /**
   * Register new user
   * Returns user object, requires separate login to get token
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      // Backend returns user object: {id, email, username, is_approved, is_admin, cognito_sub, created_at}
      const response = await apiClient.post<User>('/api/v1/auth/register', data)
      const user = response.data

      // Registration doesn't return a token - user must login separately
      // This is intentional to separate registration from authentication
      return {
        user,
        tokens: {
          accessToken: '',  // No token on registration
          refreshToken: undefined,
        },
      }
    } catch (error: any) {
      // Handle specific error cases
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.detail || 'Email already registered')
      }
      throw error
    }
  }

  /**
   * Sign out current user
   */
  async logout(): Promise<void> {
    // Clear local tokens and user data (no backend logout needed for JWT)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  /**
   * Refresh access token (not supported in local JWT auth)
   */
  async refreshToken(): Promise<AuthTokens> {
    throw new Error('Token refresh not supported. Please login again.')
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/api/v1/users/me')
    return response.data
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token')
    return !!token
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  /**
   * Password reset (not implemented for local auth)
   */
  async forgotPassword(email: string): Promise<void> {
    throw new Error('Password reset not implemented for local authentication')
  }

  /**
   * Confirm password reset (not implemented for local auth)
   */
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    throw new Error('Password reset not implemented for local authentication')
  }
}
