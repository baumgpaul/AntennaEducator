/**
 * Error handling utilities
 * Provides consistent error handling and user-friendly messages
 */

import type { ApiError } from '@/types/api'

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  title: string
  message: string
  action?: string
  retryable: boolean
}

/**
 * Convert API error to user-friendly error response
 */
export const parseApiError = (error: unknown): ErrorResponse => {
  // Handle ApiError type
  if (isApiError(error)) {
    const status = error.status || 0

    // Network errors
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
      return {
        title: 'Network Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
        action: 'Retry',
        retryable: true,
      }
    }

    // Timeout errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        title: 'Connection Timeout',
        message: 'The server took too long to respond. Please try again.',
        action: 'Retry',
        retryable: true,
      }
    }

    // Status-based errors
    switch (status) {
      case 400:
        return {
          title: 'Invalid Request',
          message: getDetailMessage(error) || 'The request was invalid. Please check your input.',
          retryable: false,
        }

      case 401:
        return {
          title: 'Authentication Required',
          message: 'Please log in to continue.',
          action: 'Login',
          retryable: false,
        }

      case 403:
        return {
          title: 'Access Denied',
          message: 'You do not have permission to perform this action.',
          retryable: false,
        }

      case 404:
        return {
          title: 'Not Found',
          message: getDetailMessage(error) || 'The requested resource was not found.',
          retryable: false,
        }

      case 409:
        return {
          title: 'Conflict',
          message: getDetailMessage(error) || 'This operation conflicts with existing data.',
          retryable: false,
        }

      case 422:
        return {
          title: 'Validation Error',
          message: getDetailMessage(error) || 'Please check your input and try again.',
          retryable: false,
        }

      case 429:
        return {
          title: 'Too Many Requests',
          message: 'You are making requests too quickly. Please wait a moment.',
          action: 'Retry',
          retryable: true,
        }

      case 500:
      case 502:
      case 503:
        return {
          title: 'Server Error',
          message: 'The server encountered an error. Please try again later.',
          action: 'Retry',
          retryable: true,
        }

      case 504:
        return {
          title: 'Gateway Timeout',
          message: 'The server took too long to respond. Please try again.',
          action: 'Retry',
          retryable: true,
        }

      default:
        return {
          title: 'Error',
          message: getDetailMessage(error) || error.message || 'An unexpected error occurred.',
          action: 'Retry',
          retryable: true,
        }
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      title: 'Error',
      message: error.message || 'An unexpected error occurred.',
      retryable: false,
    }
  }

  // Unknown error type
  return {
    title: 'Error',
    message: 'An unexpected error occurred. Please try again.',
    retryable: true,
  }
}

/**
 * Type guard for ApiError
 */
const isApiError = (error: unknown): error is ApiError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  )
}

/**
 * Extract detail message from error
 */
const getDetailMessage = (error: ApiError): string | undefined => {
  if (error.details) {
    // Try common detail fields
    if (typeof error.details.detail === 'string') {
      return error.details.detail
    }
    if (typeof error.details.message === 'string') {
      return error.details.message
    }
    // Handle validation errors array
    if (Array.isArray(error.details)) {
      return error.details.map((e: any) => e.msg || e.message).join(', ')
    }
  }
  return undefined
}

/**
 * Format error for display in notification
 */
export const formatErrorMessage = (error: unknown): string => {
  const errorResponse = parseApiError(error)
  return errorResponse.message
}

/**
 * Check if error is retryable
 */
export const isRetryableError = (error: unknown): boolean => {
  return parseApiError(error).retryable
}

/**
 * Get suggested action for error
 */
export const getErrorAction = (error: unknown): string | undefined => {
  return parseApiError(error).action
}
