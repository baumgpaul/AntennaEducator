/**
 * Authentication state slice
 * Manages user login, logout, and token state
 * Uses auth service factory to support both local JWT and AWS Cognito
 */

import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import type { User, AuthTokens } from '@/types/models'
import { getAuthService, type LoginCredentials, type RegisterData } from '@/services/auth'

interface AuthState {
  isAuthenticated: boolean
  sessionValidated: boolean
  user: User | null
  tokens: AuthTokens | null
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  isAuthenticated: false,
  sessionValidated: false,
  user: null,
  tokens: null,
  loading: false,
  error: null,
}

// Load auth state from localStorage on init
const loadAuthFromStorage = (): Partial<AuthState> => {
  try {
    const authService = getAuthService()
    const token = authService.getAccessToken()
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

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Login with email and password
 */
export const loginAsync = createAsyncThunk<
  { user: User; tokens: AuthTokens },
  LoginCredentials,
  { rejectValue: string }
>(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const authService = getAuthService()
      const response = await authService.login(credentials)
      // Convert AuthResponse to expected format
      return {
        user: response.user,
        tokens: {
          access_token: response.tokens.accessToken,
          refresh_token: response.tokens.refreshToken,
          token_type: 'Bearer',
        }
      }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Login failed')
    }
  }
)

/**
 * Register new user
 */
export const registerAsync = createAsyncThunk<
  { user: User; tokens: AuthTokens },
  RegisterData,
  { rejectValue: string }
>(
  'auth/register',
  async (data: RegisterData, { rejectWithValue }) => {
    try {
      const authService = getAuthService()
      const response = await authService.register(data)
      // Convert AuthResponse to expected format
      return {
        user: response.user,
        tokens: {
          access_token: response.tokens.accessToken,
          refresh_token: response.tokens.refreshToken,
          token_type: 'Bearer',
        }
      }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Registration failed')
    }
  }
)

/**
 * Logout user
 */
export const logoutAsync = createAsyncThunk('auth/logout', async () => {
  const authService = getAuthService()
  await authService.logout()
})

/**
 * Get current user
 */
export const getCurrentUserAsync = createAsyncThunk<
  User,
  void,
  { rejectValue: string }
>(
  'auth/getCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const authService = getAuthService()
      const user = await authService.getCurrentUser()
      return user
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to get current user')
    }
  }
)

/**
 * Refresh access token
 */
export const refreshTokenAsync = createAsyncThunk<
  { accessToken: string; refreshToken?: string },
  void,
  { rejectValue: string }
>(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    try {
      const authService = getAuthService()
      const tokens = await authService.refreshToken()
      return tokens
    } catch (error: any) {
      return rejectWithValue(error.message || 'Token refresh failed')
    }
  }
)

/**
 * Validate the current session on app startup.
 * Attempts to refresh the token to verify it's still valid.
 * If refresh fails, clears auth state so the user is redirected to login
 * before any protected content is shown.
 */
export const validateSession = createAsyncThunk<
  { accessToken: string; refreshToken?: string },
  void,
  { rejectValue: string }
>(
  'auth/validateSession',
  async (_, { rejectWithValue }) => {
    try {
      const authService = getAuthService()
      const tokens = await authService.refreshToken()
      return tokens
    } catch (error: any) {
      return rejectWithValue(error.message || 'Session validation failed')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: { ...initialState, ...loadAuthFromStorage() },
  reducers: {
    // Clear error
    clearAuthError: (state) => {
      state.error = null
    },

    // Update user info
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
        localStorage.setItem('user', JSON.stringify(state.user))
      }
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginAsync.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.isAuthenticated = true
        state.sessionValidated = true  // fresh login, no need to re-validate
        state.user = action.payload.user
        state.tokens = action.payload.tokens
        state.loading = false
        state.error = null

        // Persist to localStorage
        localStorage.setItem('user', JSON.stringify(action.payload.user))
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
        state.isAuthenticated = false
      })

    // Register
    builder
      .addCase(registerAsync.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(registerAsync.fulfilled, (state, _action) => {
        // Don't authenticate user immediately - they must verify email first
        state.isAuthenticated = false
        state.user = null
        state.tokens = null
        state.loading = false
        state.error = null

        // Don't persist to localStorage - user is not logged in yet
      })
      .addCase(registerAsync.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
        state.isAuthenticated = false
      })

    // Logout
    builder.addCase(logoutAsync.fulfilled, (state) => {
      state.isAuthenticated = false
      state.user = null
      state.tokens = null
      state.loading = false
      state.error = null

      // Clear localStorage
      localStorage.removeItem('user')
    })

    // Get current user
    builder
      .addCase(getCurrentUserAsync.pending, (state) => {
        state.loading = true
      })
      .addCase(getCurrentUserAsync.fulfilled, (state, action) => {
        state.user = action.payload
        state.loading = false
        localStorage.setItem('user', JSON.stringify(action.payload))
      })
      .addCase(getCurrentUserAsync.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Refresh token
    builder
      .addCase(refreshTokenAsync.fulfilled, (state, action) => {
        if (state.tokens) {
          state.tokens.access_token = action.payload.accessToken
          if (action.payload.refreshToken) {
            state.tokens.refresh_token = action.payload.refreshToken
          }
        }
      })
      .addCase(refreshTokenAsync.rejected, (state) => {
        // Token refresh failed, log out user
        state.isAuthenticated = false
        state.user = null
        state.tokens = null
        localStorage.removeItem('user')
      })

    // Validate session (startup token check)
    builder
      .addCase(validateSession.pending, (state) => {
        state.loading = true
      })
      .addCase(validateSession.fulfilled, (state, action) => {
        // Session is valid — update tokens and mark as validated
        state.sessionValidated = true
        state.loading = false
        if (state.tokens) {
          state.tokens.access_token = action.payload.accessToken
          if (action.payload.refreshToken) {
            state.tokens.refresh_token = action.payload.refreshToken
          }
        }
      })
      .addCase(validateSession.rejected, (state) => {
        // Session invalid — clear everything so ProtectedRoute redirects
        console.warn('[Auth] Session validation failed — clearing auth state')
        state.sessionValidated = true  // mark as "checked" even though it failed
        state.isAuthenticated = false
        state.user = null
        state.tokens = null
        state.loading = false
        localStorage.removeItem('auth_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('id_token')
        localStorage.removeItem('user')
        localStorage.setItem('logout_reason', 'session_expired')
      })
  },
})

export const {
  clearAuthError,
  updateUser,
} = authSlice.actions

export default authSlice.reducer
