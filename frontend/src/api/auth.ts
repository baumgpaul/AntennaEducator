/**
 * Authentication API service
 * Handles user authentication, registration, and token management
 */

import { apiClient } from './client'
import type { User, AuthTokens } from '@/types/models'

// ============================================================================
// Request/Response Types
// ============================================================================

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  tokens: AuthTokens
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
}

export interface RegisterResponse {
  user: User
  tokens: AuthTokens
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface RefreshTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

// ============================================================================
// Auth API
// ============================================================================

/**
 * Login user with email and password
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/api/auth/login', credentials)
  
  // Store tokens in localStorage
  if (response.data.tokens.access_token) {
    localStorage.setItem('auth_token', response.data.tokens.access_token)
  }
  if (response.data.tokens.refresh_token) {
    localStorage.setItem('refresh_token', response.data.tokens.refresh_token)
  }
  
  return response.data
}

/**
 * Register new user
 */
export const register = async (data: RegisterRequest): Promise<RegisterResponse> => {
  const response = await apiClient.post<RegisterResponse>('/api/auth/register', data)
  
  // Store tokens in localStorage
  if (response.data.tokens.access_token) {
    localStorage.setItem('auth_token', response.data.tokens.access_token)
  }
  if (response.data.tokens.refresh_token) {
    localStorage.setItem('refresh_token', response.data.tokens.refresh_token)
  }
  
  return response.data
}

/**
 * Logout user - clear tokens and session
 */
export const logout = async (): Promise<void> => {
  try {
    // Call backend logout endpoint if available
    await apiClient.post('/api/auth/logout')
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
 * Refresh access token using refresh token
 */
export const refreshToken = async (): Promise<RefreshTokenResponse> => {
  const refresh_token = localStorage.getItem('refresh_token')
  
  if (!refresh_token) {
    throw new Error('No refresh token available')
  }
  
  const response = await apiClient.post<RefreshTokenResponse>('/api/auth/refresh', {
    refresh_token,
  })
  
  // Update access token
  if (response.data.access_token) {
    localStorage.setItem('auth_token', response.data.access_token)
  }
  
  return response.data
}

/**
 * Get current user profile
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await apiClient.get<User>('/api/auth/me')
  return response.data
}

/**
 * Verify if user is authenticated (has valid token)
 */
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('auth_token')
  return !!token
}

/**
 * Check if token is expired (basic check without decoding JWT)
 * For production, you'd want to decode the JWT and check exp claim
 */
export const isTokenExpired = (): boolean => {
  // TODO: Implement JWT decoding to check expiration
  // For now, assume token is valid if it exists
  return !isAuthenticated()
}
