/**
 * Authentication state slice
 * Manages user login, logout, and token state
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { User, AuthTokens } from '@/types/models'

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  tokens: AuthTokens | null
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  tokens: null,
  loading: false,
  error: null,
}

// Load auth state from localStorage on init
const loadAuthFromStorage = (): Partial<AuthState> => {
  try {
    const token = localStorage.getItem('auth_token')
    const userStr = localStorage.getItem('user')
    
    if (token && userStr) {
      return {
        isAuthenticated: true,
        user: JSON.parse(userStr),
        tokens: { access_token: token, token_type: 'Bearer' },
      }
    }
  } catch (error) {
    console.error('Failed to load auth from storage:', error)
  }
  return {}
}

const authSlice = createSlice({
  name: 'auth',
  initialState: { ...initialState, ...loadAuthFromStorage() },
  reducers: {
    // Login actions
    loginStart: (state) => {
      state.loading = true
      state.error = null
    },
    loginSuccess: (state, action: PayloadAction<{ user: User; tokens: AuthTokens }>) => {
      state.isAuthenticated = true
      state.user = action.payload.user
      state.tokens = action.payload.tokens
      state.loading = false
      state.error = null
      
      // Persist to localStorage
      localStorage.setItem('auth_token', action.payload.tokens.access_token)
      localStorage.setItem('user', JSON.stringify(action.payload.user))
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false
      state.error = action.payload
      state.isAuthenticated = false
    },
    
    // Logout
    logout: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.tokens = null
      state.loading = false
      state.error = null
      
      // Clear localStorage
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
    },
    
    // Update user info
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
        localStorage.setItem('user', JSON.stringify(state.user))
      }
    },
    
    // Clear error
    clearAuthError: (state) => {
      state.error = null
    },
  },
})

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  updateUser,
  clearAuthError,
} = authSlice.actions

export default authSlice.reducer
