/**
 * Base API client configuration using Axios
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '@/types/api'

// Environment configuration
const getBaseURL = () => {
  // Use empty string for relative URLs (uses Vite proxy in dev)
  // In production, this will be set to API Gateway URL
  const url = import.meta.env.VITE_API_BASE_URL as string
  return url !== undefined ? url : ''
}

const getPreprocessorURL = () => {
  return (import.meta.env.VITE_PREPROCESSOR_URL as string) || 'http://localhost:8001'
}

const getSolverURL = () => {
  return (import.meta.env.VITE_SOLVER_URL as string) || 'http://localhost:8002'
}

const getPostprocessorURL = () => {
  return (import.meta.env.VITE_POSTPROCESSOR_URL as string) || 'http://localhost:8003'
}

const getProjectsURL = () => {
  return (import.meta.env.VITE_PROJECTS_URL as string) || 'http://localhost:8010'
}

// Token refresh state management
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else if (token) {
      prom.resolve(token)
    }
  })
  
  failedQueue = []
}

// Refresh token function
const refreshAccessToken = async (): Promise<string> => {
  const refresh_token = localStorage.getItem('refresh_token')
  
  if (!refresh_token) {
    throw new Error('No refresh token available')
  }
  
  try {
    const response = await axios.post(`${getBaseURL()}/api/auth/refresh`, {
      refresh_token,
    })
    
    const { access_token } = response.data
    localStorage.setItem('auth_token', access_token)
    return access_token
  } catch (error) {
    // Refresh failed - clear tokens and redirect to login
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
    throw error
  }
}

// Create base Axios instance
const createApiClient = (baseURL: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: 60000, // 60 seconds (solver can take time)
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Request interceptor - add auth token if available
  instance.interceptors.request.use(
    (config) => {
      // Development mode: use stub token if auth is disabled
      const authEnabled = import.meta.env.VITE_ENABLE_AUTH === 'true'
      
      let token = localStorage.getItem('auth_token')
      
      // If auth is disabled and no token exists, use dev stub
      if (!authEnabled && !token) {
        token = 'dev_stub_token_' + Date.now()
        console.log('[DEV] Using stub JWT token (auth disabled)')
      }
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor - handle errors and token refresh
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
      
      const apiError: ApiError = {
        message: error.message,
        status: error.response?.status,
        code: error.code,
        details: error.response?.data as Record<string, unknown>,
      }

      // Handle 401 Unauthorized - attempt token refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        // In dev mode with auth disabled, skip token refresh
        const authEnabled = import.meta.env.VITE_ENABLE_AUTH === 'true'
        if (!authEnabled) {
          console.warn('[DEV] Got 401, but auth is disabled - ignoring')
          return Promise.reject(apiError)
        }
        
        // Skip refresh for login/register/refresh endpoints
        const isAuthEndpoint = originalRequest.url?.includes('/api/auth/')
        if (isAuthEndpoint) {
          // Clear tokens and redirect to login
          localStorage.removeItem('auth_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
          return Promise.reject(apiError)
        }

        if (isRefreshing) {
          // Wait for ongoing refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`
              }
              return instance(originalRequest)
            })
            .catch((err) => {
              return Promise.reject(err)
            })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
          const newToken = await refreshAccessToken()
          processQueue(null, newToken)
          
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
          }
          
          return instance(originalRequest)
        } catch (refreshError) {
          processQueue(refreshError, null)
          return Promise.reject(apiError)
        } finally {
          isRefreshing = false
        }
      }

      return Promise.reject(apiError)
    }
  )

  return instance
}

// Create service-specific clients
export const apiClient = createApiClient(getBaseURL())
export const preprocessorClient = createApiClient(getPreprocessorURL())
export const solverClient = createApiClient(getSolverURL())
export const postprocessorClient = createApiClient(getPostprocessorURL())
export const projectsClient = createApiClient(getProjectsURL())

// Export URL getters for reference
export { getBaseURL, getPreprocessorURL, getSolverURL, getPostprocessorURL, getProjectsURL }

// Helper function for handling API responses
export const handleApiResponse = <T>(response: { data: T }): T => {
  return response.data
}

// Helper function for handling API errors
export const handleApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.detail || error.message,
      status: error.response?.status,
      code: error.code,
      details: error.response?.data,
    }
  }
  
  return {
    message: error instanceof Error ? error.message : 'Unknown error',
  }
}

export default apiClient
