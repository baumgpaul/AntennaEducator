/**
 * Authentication API service
 * Handles user authentication, registration, and token management
 */

import { authClient } from './client'
import type { User } from '@/types/models'

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
  } catch (error: unknown) {
    const axiosErr = error as { response?: { status?: number; data?: { detail?: string } } }
    if (axiosErr.response?.status === 403) {
      throw new Error('Account pending admin approval. Please wait for approval.')
    }
    if (axiosErr.response?.status === 401) {
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
  } catch (error: unknown) {
    const axiosErr = error as { response?: { status?: number; data?: { detail?: string } } }
    if (axiosErr.response?.status === 400) {
      throw new Error(axiosErr.response?.data?.detail || 'Email already registered')
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
 * Check if token is expired by decoding the JWT payload and checking the exp claim.
 * Returns true if the token is missing, malformed, or expired.
 */
export const isTokenExpired = (): boolean => {
  const token = localStorage.getItem('auth_token')
  if (!token) return true

  try {
    const payloadBase64 = token.split('.')[1]
    if (!payloadBase64) return true
    const payload = JSON.parse(atob(payloadBase64))
    if (typeof payload.exp !== 'number') return true
    // Expired if exp is in the past (with 30s grace period for clock skew)
    return payload.exp < Date.now() / 1000 - 30
  } catch {
    return true
  }
}
