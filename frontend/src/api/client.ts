/**
 * Base API client configuration using Axios
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import type { ApiError } from '@/types/api'

// Environment configuration
const getBaseURL = () => {
  return (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000'
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
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor - handle errors consistently
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const apiError: ApiError = {
        message: error.message,
        status: error.response?.status,
        code: error.code,
        details: error.response?.data as Record<string, unknown>,
      }

      // Handle specific error cases
      if (error.response?.status === 401) {
        // Unauthorized - clear token and redirect to login
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
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
