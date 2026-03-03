/**
 * Authentication API service
 * Handles user authentication, registration, and token management
 */

import { authClient } from './client'
import type { User, AuthTokens } from '@/types/models'

// ============================================================================
// Request/Response Types
// ============================================================================

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
}

export interface RegisterResponse {
  id: number
  email: string
  username: string
  is_approved: boolean
  is_admin: boolean
  role?: string
  cognito_sub?: string
  created_at: string
}

// ============================================================================
// Auth API
// ============================================================================

/**
 * Login user with email and password
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  try {
    const response = await authClient.post<LoginResponse>('/api/auth/login', credentials)

    // Store token in localStorage
    if (response.data.access_token) {
      localStorage.setItem('auth_token', response.data.access_token)
    }

    return response.data
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
 */
export const register = async (data: RegisterRequest): Promise<RegisterResponse> => {
  try {
    const response = await authClient.post<RegisterResponse>('/api/auth/register', data)

    // In Docker mode, user is auto-approved and can log in immediately
    // No token returned from registration - user must login
    return response.data
  } catch (error: any) {
    // Handle specific error cases
    if (error.response?.status === 400) {
      throw new Error(error.response?.data?.detail || 'Email already registered')
    }
    throw error
  }
}

/**
 * Logout user - clear tokens and session
 */
export const logout = async (): Promise<void> => {
  // Clear local tokens (no backend logout endpoint needed for JWT)
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
}

/**
 * Get current user profile
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await authClient.get<User>('/api/auth/me')
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
