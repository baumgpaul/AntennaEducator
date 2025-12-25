import type { LoginRequest, LoginResponse, RegisterRequest } from './auth';

// Mock user storage
interface MockUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

let mockUsers: MockUser[] = [
  {
    id: '1',
    email: 'demo@example.com',
    password: 'password123',
    name: 'Demo User',
  },
];

let nextUserId = 2;
let currentToken: string | null = null;

// Simulate network delay
const delay = (ms: number = 500) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock Authentication API - In-memory auth for testing
 */

export async function login(data: LoginRequest): Promise<LoginResponse> {
  await delay();
  
  const user = mockUsers.find(u => u.email === data.email && u.password === data.password);
  if (!user) {
    throw new Error('Invalid email or password');
  }
  
  const token = `mock-token-${Date.now()}`;
  const refreshToken = `mock-refresh-${Date.now()}`;
  currentToken = token;
  
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}

export async function register(data: RegisterRequest): Promise<LoginResponse> {
  await delay();
  
  // Check if user already exists
  if (mockUsers.find(u => u.email === data.email)) {
    throw new Error('Email already registered');
  }
  
  const newUser: MockUser = {
    id: String(nextUserId++),
    email: data.email,
    password: data.password,
    name: data.name || data.email.split('@')[0],
  };
  mockUsers.push(newUser);
  
  const token = `mock-token-${Date.now()}`;
  const refreshToken = `mock-refresh-${Date.now()}`;
  currentToken = token;
  
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    },
  };
}

export async function logout(): Promise<void> {
  await delay(200);
  currentToken = null;
}

export async function refreshToken(token: string): Promise<{ access_token: string; refresh_token: string }> {
  await delay(200);
  return {
    access_token: `mock-token-${Date.now()}`,
    refresh_token: `mock-refresh-${Date.now()}`,
  };
}
