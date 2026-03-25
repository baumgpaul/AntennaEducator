/**
 * AWS Cognito Authentication Service
 * Implements authentication using AWS Cognito User Pools
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js'
import type { IAuthService, LoginCredentials, RegisterData, AuthResponse, AuthTokens } from './types'
import type { User } from '@/types/models'
import { getCurrentUser as fetchProfile } from '@/api/auth'

export class CognitoAuthService implements IAuthService {
  private userPool: CognitoUserPool
  private currentUser: CognitoUser | null = null

  constructor() {
    const poolData = {
      UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
    }

    if (!poolData.UserPoolId || !poolData.ClientId) {
      console.warn('Cognito configuration missing. Check environment variables.')
    }

    this.userPool = new CognitoUserPool(poolData)
  }

  /**
   * Sign in with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: credentials.email,
        Password: credentials.password,
      })

      const userData = {
        Username: credentials.email,
        Pool: this.userPool,
      }

      const cognitoUser = new CognitoUser(userData)
      this.currentUser = cognitoUser

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const accessToken = result.getAccessToken().getJwtToken()
          const idToken = result.getIdToken().getJwtToken()
          const refreshToken = result.getRefreshToken().getToken()

          // Store tokens in localStorage
          localStorage.setItem('auth_token', accessToken)
          localStorage.setItem('id_token', idToken)
          localStorage.setItem('refresh_token', refreshToken)

          // Fetch enriched profile from backend (role, tokens, etc.)
          const idTokenPayload = result.getIdToken().payload
          const fallbackUser: User = {
            id: idTokenPayload.sub,
            email: idTokenPayload.email || credentials.email,
            username: idTokenPayload['cognito:username'] || credentials.email,
            is_approved: true,
            is_admin: false,
            created_at: new Date().toISOString(),
          }

          const tokens: AuthTokens = {
            accessToken,
            idToken,
            refreshToken,
            expiresIn: result.getAccessToken().getExpiration(),
          }

          fetchProfile()
            .then((profile) => resolve({ user: profile, tokens }))
            .catch(() => resolve({ user: fallbackUser, tokens }))
        },
        onFailure: (err) => {
          // Provide more specific error messages
          let errorMessage = err.message || 'Authentication failed'

          if (err.code === 'UserNotConfirmedException') {
            errorMessage = 'Please verify your email address before logging in. Check your email for the verification code.'
          } else if (err.code === 'NotAuthorizedException') {
            errorMessage = 'Incorrect email or password'
          } else if (err.code === 'UserNotFoundException') {
            errorMessage = 'No account found with this email'
          }

          reject(new Error(errorMessage))
        },
      })
    })
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    return new Promise((resolve, reject) => {
      const attributeList: CognitoUserAttribute[] = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: data.email,
        }),
        new CognitoUserAttribute({
          Name: 'preferred_username',
          Value: data.username,
        }),
      ]

      this.userPool.signUp(
        data.email,
        data.password,
        attributeList,
        [],
        (err, result) => {
          if (err) {
            reject(new Error(err.message || 'Registration failed'))
            return
          }

          if (!result) {
            reject(new Error('Registration failed - no result'))
            return
          }

          const user: User = {
            id: result.userSub,
            email: data.email,
            username: data.username,
            is_approved: true,
            is_admin: false,
            created_at: new Date().toISOString(),
          }

          // Return registration success WITHOUT logging in
          // User must verify email before they can login
          resolve({
            user,
            tokens: {
              accessToken: '',
              refreshToken: '',
            },
            message: 'Registration successful. Please check your email to verify your account before logging in.',
          })
        }
      )
    })
  }

  /**
   * Sign out current user
   */
  async logout(): Promise<void> {
    if (this.currentUser) {
      this.currentUser.signOut()
      this.currentUser = null
    } else {
      const cognitoUser = this.userPool.getCurrentUser()
      if (cognitoUser) {
        cognitoUser.signOut()
      }
    }

    // Clear tokens from localStorage
    localStorage.removeItem('auth_token')
    localStorage.removeItem('id_token')
    localStorage.removeItem('refresh_token')
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const cognitoUser = this.userPool.getCurrentUser()

      if (!cognitoUser) {
        reject(new Error('No current user'))
        return
      }

      cognitoUser.getSession((err: Error | null, session: any) => {
        if (err) {
          reject(err)
          return
        }

        if (!session.isValid()) {
          reject(new Error('Session is not valid'))
          return
        }

        const refreshTokenStr = localStorage.getItem('refresh_token')
        if (!refreshTokenStr) {
          reject(new Error('No refresh token available'))
          return
        }

        const refreshToken = new CognitoRefreshToken({ RefreshToken: refreshTokenStr })

        cognitoUser.refreshSession(refreshToken, (err, session) => {
          if (err) {
            reject(err)
            return
          }

          const accessToken = session.getAccessToken().getJwtToken()
          const idToken = session.getIdToken().getJwtToken()

          // Update tokens in localStorage
          localStorage.setItem('auth_token', accessToken)
          localStorage.setItem('id_token', idToken)

          resolve({
            accessToken,
            idToken,
            refreshToken: refreshTokenStr,
            expiresIn: session.getAccessToken().getExpiration(),
          })
        })
      })
    })
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    return new Promise((resolve, reject) => {
      const cognitoUser = this.userPool.getCurrentUser()

      if (!cognitoUser) {
        reject(new Error('No current user'))
        return
      }

      cognitoUser.getSession((err: Error | null, session: any) => {
        if (err) {
          reject(err)
          return
        }

        if (!session.isValid()) {
          reject(new Error('Session is not valid'))
          return
        }

        // Fetch enriched profile from backend
        fetchProfile()
          .then((profile) => resolve(profile))
          .catch(() => {
            // Fallback to Cognito attributes if backend fails
            cognitoUser.getUserAttributes((err, attributes) => {
              if (err) {
                reject(err)
                return
              }

              const idTokenPayload = session.getIdToken().payload

              const user: User = {
                id: idTokenPayload.sub,
                email: attributes?.find((attr) => attr.Name === 'email')?.Value || '',
                username:
                  attributes?.find((attr) => attr.Name === 'preferred_username')?.Value ||
                  idTokenPayload['cognito:username'] ||
                  '',
                is_approved: true,
                is_admin: false,
                created_at: new Date().toISOString(),
              }

              resolve(user)
            })
          })
      })
    })
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token')
    if (!token) return false

    const cognitoUser = this.userPool.getCurrentUser()
    return cognitoUser !== null
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      }

      const cognitoUser = new CognitoUser(userData)

      cognitoUser.forgotPassword({
        onSuccess: () => {
          resolve()
        },
        onFailure: (err) => {
          reject(new Error(err.message || 'Password reset failed'))
        },
      })
    })
  }

  /**
   * Confirm password reset with verification code
   */
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      }

      const cognitoUser = new CognitoUser(userData)

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          resolve()
        },
        onFailure: (err) => {
          reject(new Error(err.message || 'Password reset confirmation failed'))
        },
      })
    })
  }
}
