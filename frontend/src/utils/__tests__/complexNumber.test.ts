import { describe, it, expect } from 'vitest'
import {
  parseComplex,
  parseComplexArray,
  complexMagnitude,
  complexPhaseDeg,
  formatComplex,
} from '@/utils/complexNumber'

describe('parseComplex', () => {
  it('parses {real, imag} object', () => {
    expect(parseComplex({ real: 3, imag: 4 })).toEqual({ real: 3, imag: 4 })
  })

  it('parses plain number as real only', () => {
    expect(parseComplex(42)).toEqual({ real: 42, imag: 0 })
  })

  it('parses [real, imag] array', () => {
    expect(parseComplex([1.5, -2.5])).toEqual({ real: 1.5, imag: -2.5 })
  })

  it('parses Python complex string "1+2j"', () => {
    expect(parseComplex('1+2j')).toEqual({ real: 1, imag: 2 })
  })

  it('parses negative imaginary "3.5-1.2j"', () => {
    const r = parseComplex('3.5-1.2j')
    expect(r.real).toBeCloseTo(3.5)
    expect(r.imag).toBeCloseTo(-1.2)
  })

  it('parses parenthesized "(50+20j)"', () => {
    expect(parseComplex('(50+20j)')).toEqual({ real: 50, imag: 20 })
  })

  it('parses pure imaginary "5j"', () => {
    expect(parseComplex('5j')).toEqual({ real: 0, imag: 5 })
  })

  it('parses scientific notation "1e3+0.2j"', () => {
    const r = parseComplex('1e3+0.2j')
    expect(r.real).toBeCloseTo(1000)
    expect(r.imag).toBeCloseTo(0.2)
  })

  it('returns zero for null/undefined', () => {
    expect(parseComplex(null)).toEqual({ real: 0, imag: 0 })
    expect(parseComplex(undefined)).toEqual({ real: 0, imag: 0 })
  })

  it('returns zero for unparseable string', () => {
    expect(parseComplex('abc')).toEqual({ real: 0, imag: 0 })
  })
})

describe('parseComplexArray', () => {
  it('parses array of mixed formats', () => {
    const result = parseComplexArray([{ real: 1, imag: 2 }, 5, '3+4j'])
    expect(result).toEqual([
      { real: 1, imag: 2 },
      { real: 5, imag: 0 },
      { real: 3, imag: 4 },
    ])
  })
})

describe('complexMagnitude', () => {
  it('computes |3+4j| = 5', () => {
    expect(complexMagnitude({ real: 3, imag: 4 })).toBeCloseTo(5)
  })

  it('computes |0+0j| = 0', () => {
    expect(complexMagnitude({ real: 0, imag: 0 })).toBe(0)
  })
})

describe('complexPhaseDeg', () => {
  it('computes phase of 1+1j = 45°', () => {
    expect(complexPhaseDeg({ real: 1, imag: 1 })).toBeCloseTo(45)
  })

  it('computes phase of -1+0j = 180°', () => {
    expect(complexPhaseDeg({ real: -1, imag: 0 })).toBeCloseTo(180)
  })
})

describe('formatComplex', () => {
  it('formats positive imaginary', () => {
    expect(formatComplex({ real: 1.234, imag: 5.678 }, 2)).toBe('1.23+5.68j')
  })

  it('formats negative imaginary', () => {
    expect(formatComplex({ real: 1, imag: -2 }, 1)).toBe('1.0-2.0j')
  })
})
