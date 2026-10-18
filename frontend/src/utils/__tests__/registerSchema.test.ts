import { describe, it, expect } from 'vitest'
import { registerSchema } from '../validation'

const valid = (password: string) =>
  registerSchema.safeParse({
    username: 'student',
    email: 'a@example.com',
    password,
    confirmPassword: password,
  }).success

describe('registerSchema password length (B12)', () => {
  it('accepts a 72-byte password', () => {
    expect(valid('Aa1' + 'x'.repeat(69))).toBe(true)
  })

  it('rejects a 73-byte password', () => {
    expect(valid('Aa1' + 'x'.repeat(70))).toBe(false)
  })

  it('counts UTF-8 bytes, not characters', () => {
    expect(valid('Aa1' + 'ä'.repeat(35))).toBe(false) // 38 chars, 73 bytes
  })
})
