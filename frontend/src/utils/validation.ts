/**
 * Form validation schemas using Zod
 */

import { z } from 'zod'

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
})

export type LoginFormData = z.infer<typeof loginSchema>

/**
 * Registration form validation schema
 */
export const registerSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z
    .string()
    .min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type RegisterFormData = z.infer<typeof registerSchema>

/**
 * Project creation validation schema
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .min(3, 'Project name must be at least 3 characters')
    .max(100, 'Project name must not exceed 100 characters'),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),
})

export type CreateProjectFormData = z.infer<typeof createProjectSchema>

/**
 * Antenna configuration validation schemas
 */

export const dipoleConfigSchema = z.object({
  length: z
    .number()
    .positive('Length must be positive')
    .max(100, 'Length must not exceed 100 meters'),
  radius: z
    .number()
    .positive('Radius must be positive')
    .max(1, 'Radius must not exceed 1 meter'),
  segments: z
    .number()
    .int('Segments must be an integer')
    .min(5, 'Minimum 5 segments required')
    .max(200, 'Maximum 200 segments allowed'),
  frequency: z
    .number()
    .positive('Frequency must be positive')
    .min(1e6, 'Frequency must be at least 1 MHz')
    .max(1e10, 'Frequency must not exceed 10 GHz'),
})

export type DipoleConfigFormData = z.infer<typeof dipoleConfigSchema>
