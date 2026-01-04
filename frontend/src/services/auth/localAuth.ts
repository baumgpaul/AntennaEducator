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
    const response = await apiClient.post<{
      user: User
      access_token: string
      refresh_token?: string
      token_type: string
    }>('/api/v1/auth/login', credentials)

    const { user, access_token, refresh_token } = response.data

    // Store tokens in localStorage
    localStorage.setItem('auth_token', access_token)
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token)
    }

    return {
      user,
      tokens: {
        accessToken: access_token,
        refreshToken: refresh_token,
      },
    }
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<{
      user: User
      access_token: string
      refresh_token?: string
      token_type: string
    }>('/api/v1/auth/register', data)

    const { user, access_token, refresh_token } = response.data

    // Store tokens in localStorage
    localStorage.setItem('auth_token', access_token)
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token)
    }

    return {
      user,
      tokens: {
        accessToken: access_token,
        refreshToken: refresh_token,
      },
    }
  }

  /**
   * Sign out current user
   */
  async logout(): Promise<void> {
    try {
      // Call backend logout endpoint if available
      await apiClient.post('/api/v1/auth/logout')
    } catch (error) {
      // Continue even if backend call fails
      console.warn('Logout API call failed:', error)
    } finally {
      // Always clear local tokens
      localStorage.removeItem('auth_token')
      localStorage.removeItem('refresh_token')
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthTokens> {
    const refresh_token = localStorage.getItem('refresh_token')

    if (!refresh_token) {
      throw new Error('No refresh token available')
    }

    const response = await apiClient.post<{
      access_token: string
      token_type: string
      expires_in?: number
    }>('/api/v1/auth/refresh', {
      refresh_token,
    })

    const { access_token, expires_in } = response.data

    // Update access token
    localStorage.setItem('auth_token', access_token)

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/api/v1/auth/me')
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
