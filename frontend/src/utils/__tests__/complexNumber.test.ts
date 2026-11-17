import { describe, it, expect } from 'vitest'
import {
  parseComplex,
  parseComplexArray,
  complexMagnitude,
  complexPhaseDeg,
  formatComplex,
  parseComplexString,
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

describe('parseComplex — Python scientific notation', () => {
  // Python writes a part with |x| < 1e-4 (or >= 1e16) in scientific notation.
  // The old greedy regex split inside the exponent: "0.0123-3.4e-05j" gave imag = -5.
  it.each([
    ['0.0123-3.4e-05j', 0.0123, -3.4e-5],
    ['1e-05-2.5e-06j', 1e-5, -2.5e-6],
    ['(1.5e-05+0.002j)', 1.5e-5, 0.002],
    ['-2.5E-07+1E-08j', -2.5e-7, 1e-8],
    ['1e+20+3e+20j', 1e20, 3e20],
    ['-4.53-5.98j', -4.53, -5.98],
    ['.5-.25j', 0.5, -0.25],
    ['3e-05j', 0, 3e-5],
    ['-0j', 0, -0],
  ])('%s', (input, real, imag) => {
    const z = parseComplex(input)
    expect(z.real).toBeCloseTo(real, 20)
    expect(z.imag).toBeCloseTo(imag, 20)
  })

  it('rejects malformed strings instead of guessing a split', () => {
    expect(parseComplexString('1e-05-2.5e-06')).toBeNull() // no j
    expect(parseComplexString('1--2j')).toBeNull()
    expect(parseComplexString('abc')).toBeNull()
  })
})
