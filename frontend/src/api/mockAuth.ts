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
  
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: {
      id: user.id,
      email: user.email,
      username: user.email.split('@')[0],
      created_at: new Date().toISOString(),
    },
    tokens: {
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
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
    name: data.username || data.email.split('@')[0],
  };
  mockUsers.push(newUser);
  
  const token = `mock-token-${Date.now()}`;
  const refreshToken = `mock-refresh-${Date.now()}`;
  
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: {
      id: newUser.id,
      email: newUser.email,
      username: data.username,
      created_at: new Date().toISOString(),
    },
    tokens: {
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
    },
  };
}

export async function logout(): Promise<void> {
  await delay(200);
}

export async function refreshToken(_token: string): Promise<{ access_token: string; refresh_token: string }> {
  await delay(200);
  return {
    access_token: `mock-token-${Date.now()}`,
    refresh_token: `mock-refresh-${Date.now()}`,
  };
}
