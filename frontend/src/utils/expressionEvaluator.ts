/**
 * Safe expression evaluator for client-side variable resolution.
 *
 * Mirrors the backend expression engine (backend/common/utils/expressions.py)
 * to provide live preview of evaluated values in the UI.
 *
 * Uses a simple recursive-descent parser — no eval().
 */

// Built-in physical constants (must match backend/common/constants.py)
export const BUILTIN_CONSTANTS: Record<string, number> = {
  C_0: 299792458.0,
  MU_0: 4 * Math.PI * 1e-7,
  EPSILON_0: 8.854187817e-12,
  Z_0: 376.73031346177,
  pi: Math.PI,
  e: Math.E,
  inf: Infinity,
}

// Allowed math functions
const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sqrt: Math.sqrt,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  round: Math.round,
  ceil: Math.ceil,
  floor: Math.floor,
  degrees: (rad: number) => (rad * 180) / Math.PI,
  radians: (deg: number) => (deg * Math.PI) / 180,
}

export class ExpressionError extends Error {
  public readonly expression: string

  constructor(expression: string, message: string) {
    super(`Expression '${expression}': ${message}`)
    this.name = 'ExpressionError'
    this.expression = expression
  }
}

// Token types for the lexer
type TokenType =
  | 'NUMBER'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF'

interface Token {
  type: TokenType
  value: string
  pos: number
}

/**
 * Tokenize an expression string.
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  const src = expression

  while (pos < src.length) {
    // Skip whitespace
    if (/\s/.test(src[pos])) {
      pos++
      continue
    }

    // Number: integer, decimal, or scientific notation
    if (/[0-9.]/.test(src[pos])) {
      const start = pos
      // Match digits, optional decimal, optional exponent
      while (pos < src.length && /[0-9]/.test(src[pos])) pos++
      if (pos < src.length && src[pos] === '.') {
        pos++
        while (pos < src.length && /[0-9]/.test(src[pos])) pos++
      }
      if (pos < src.length && /[eE]/.test(src[pos])) {
        pos++
        if (pos < src.length && /[+-]/.test(src[pos])) pos++
        while (pos < src.length && /[0-9]/.test(src[pos])) pos++
      }
      tokens.push({ type: 'NUMBER', value: src.slice(start, pos), pos: start })
      continue
    }

    // Identifier (variable or function name)
    if (/[a-zA-Z_]/.test(src[pos])) {
      const start = pos
      while (pos < src.length && /[a-zA-Z0-9_]/.test(src[pos])) pos++
      tokens.push({
        type: 'IDENTIFIER',
        value: src.slice(start, pos),
        pos: start,
      })
      continue
    }

    // Two-character operators
    if (pos + 1 < src.length && src[pos] === '*' && src[pos + 1] === '*') {
      tokens.push({ type: 'OPERATOR', value: '**', pos })
      pos += 2
      continue
    }
    if (pos + 1 < src.length && src[pos] === '/' && src[pos + 1] === '/') {
      tokens.push({ type: 'OPERATOR', value: '//', pos })
      pos += 2
      continue
    }

    // Single-character operators and punctuation
    if ('+-*/%'.includes(src[pos])) {
      tokens.push({ type: 'OPERATOR', value: src[pos], pos })
      pos++
      continue
    }
    if (src[pos] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', pos })
      pos++
      continue
    }
    if (src[pos] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', pos })
      pos++
      continue
    }
    if (src[pos] === ',') {
      tokens.push({ type: 'COMMA', value: ',', pos })
      pos++
      continue
    }

    throw new ExpressionError(
      expression,
      `Unexpected character '${src[pos]}' at position ${pos}`
    )
  }

  tokens.push({ type: 'EOF', value: '', pos })
  return tokens
}

/**
 * Recursive descent parser for mathematical expressions.
 *
 * Grammar:
 *   expr       = term (('+' | '-') term)*
 *   term       = power (('*' | '/' | '//' | '%') power)*
 *   power      = unary ('**' power)?       (right-associative)
 *   unary      = ('+' | '-') unary | call
 *   call       = IDENTIFIER '(' args ')'  | atom
 *   atom       = NUMBER | IDENTIFIER | '(' expr ')'
 */
class Parser {
  private tokens: Token[]
  private pos: number
  private expression: string
  private variables: Record<string, number>

  constructor(tokens: Token[], expression: string, variables: Record<string, number>) {
    this.tokens = tokens
    this.pos = 0
    this.expression = expression
    this.variables = variables
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]
    this.pos++
    return tok
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.peek()
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new ExpressionError(
        this.expression,
        `Expected ${value || type} but got '${tok.value}' at position ${tok.pos}`
      )
    }
    return this.advance()
  }

  parse(): number {
    const result = this.parseExpr()
    if (this.peek().type !== 'EOF') {
      throw new ExpressionError(
        this.expression,
        `Unexpected token '${this.peek().value}' at position ${this.peek().pos}`
      )
    }
    return result
  }

  private parseExpr(): number {
    let left = this.parseTerm()
    while (
      this.peek().type === 'OPERATOR' &&
      (this.peek().value === '+' || this.peek().value === '-')
    ) {
      const op = this.advance().value
      const right = this.parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  private parseTerm(): number {
    let left = this.parsePower()
    while (
      this.peek().type === 'OPERATOR' &&
      ['*', '/', '//', '%'].includes(this.peek().value)
    ) {
      const op = this.advance().value
      const right = this.parsePower()
      if (op === '*') left = left * right
      else if (op === '/') {
        if (right === 0)
          throw new ExpressionError(this.expression, 'Division by zero')
        left = left / right
      } else if (op === '//') {
        if (right === 0)
          throw new ExpressionError(this.expression, 'Division by zero')
        left = Math.floor(left / right)
      } else if (op === '%') {
        left = left % right
      }
    }
    return left
  }

  private parsePower(): number {
    const base = this.parseUnary()
    if (
      this.peek().type === 'OPERATOR' &&
      this.peek().value === '**'
    ) {
      this.advance()
      const exp = this.parsePower() // right-associative
      return Math.pow(base, exp)
    }
    return base
  }

  private parseUnary(): number {
    if (
      this.peek().type === 'OPERATOR' &&
      (this.peek().value === '+' || this.peek().value === '-')
    ) {
      const op = this.advance().value
      const operand = this.parseUnary()
      return op === '-' ? -operand : operand
    }
    return this.parseCall()
  }

  private parseCall(): number {
    if (
      this.peek().type === 'IDENTIFIER' &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1].type === 'LPAREN'
    ) {
      const name = this.advance().value
      const fn = ALLOWED_FUNCTIONS[name]
      if (!fn) {
        throw new ExpressionError(
          this.expression,
          `Unknown function '${name}'`
        )
      }
      this.expect('LPAREN')
      const args: number[] = []
      if (this.peek().type !== 'RPAREN') {
        args.push(this.parseExpr())
        while (this.peek().type === 'COMMA') {
          this.advance()
          args.push(this.parseExpr())
        }
      }
      this.expect('RPAREN')
      try {
        return fn(...args)
      } catch {
        throw new ExpressionError(
          this.expression,
          `Error calling ${name}`
        )
      }
    }
    return this.parseAtom()
  }

  private parseAtom(): number {
    const tok = this.peek()

    // Number literal
    if (tok.type === 'NUMBER') {
      this.advance()
      return parseFloat(tok.value)
    }

    // Variable / constant reference
    if (tok.type === 'IDENTIFIER') {
      this.advance()
      if (tok.value in this.variables) return this.variables[tok.value]
      if (tok.value in BUILTIN_CONSTANTS) return BUILTIN_CONSTANTS[tok.value]
      if (tok.value in ALLOWED_FUNCTIONS) {
        throw new ExpressionError(
          this.expression,
          `'${tok.value}' is a function — use ${tok.value}(...)`
        )
      }
      throw new ExpressionError(
        this.expression,
        `Unknown variable '${tok.value}'`
      )
    }

    // Parenthesized expression
    if (tok.type === 'LPAREN') {
      this.advance()
      const result = this.parseExpr()
      this.expect('RPAREN')
      return result
    }

    throw new ExpressionError(
      this.expression,
      `Unexpected token '${tok.value}' at position ${tok.pos}`
    )
  }
}

/**
 * Safely evaluate a mathematical expression string.
 */
export function evaluateExpression(
  expression: string,
  variables: Record<string, number> = {}
): number {
  const expr = expression.trim()
  if (!expr) throw new ExpressionError(expression, 'Empty expression')

  const tokens = tokenize(expr)
  const parser = new Parser(tokens, expression, variables)
  const result = parser.parse()

  if (Number.isNaN(result)) {
    throw new ExpressionError(expression, 'Result is NaN')
  }
  return result
}

/**
 * Parse a value that can be either a number or an expression string.
 */
export function parseNumericOrExpression(
  value: number | string,
  variables: Record<string, number> = {}
): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return evaluateExpression(value, variables)
  throw new ExpressionError(String(value), `Expected number or string`)
}

/**
 * Extract variable names referenced in an expression (excludes builtins).
 */
export function getExpressionVariables(expression: string): Set<string> {
  const expr = expression.trim()
  if (!expr) return new Set()

  try {
    const tokens = tokenize(expr)
    const names = new Set<string>()
    for (const tok of tokens) {
      if (
        tok.type === 'IDENTIFIER' &&
        !(tok.value in BUILTIN_CONSTANTS) &&
        !(tok.value in ALLOWED_FUNCTIONS)
      ) {
        names.add(tok.value)
      }
    }
    return names
  } catch {
    return new Set()
  }
}

/** Variable definition matching the backend model. */
export interface VariableDefinition {
  name: string
  expression: string
  unit?: string | null
  description?: string | null
}

/**
 * Evaluate a list of variables in order (top-down).
 * Returns a map of variable name → evaluated value or error string.
 */
export function evaluateVariableContext(
  variables: VariableDefinition[]
): Record<string, number | string> {
  const context: Record<string, number> = { ...BUILTIN_CONSTANTS }
  const results: Record<string, number | string> = {}

  for (const v of variables) {
    try {
      const value = evaluateExpression(v.expression, context)
      context[v.name] = value
      results[v.name] = value
    } catch (e) {
      results[v.name] =
        e instanceof ExpressionError ? e.message : String(e)
    }
  }

  return results
}

/**
 * Evaluate variables and return only the successful numeric values.
 * Used to build a context dict for expression fields.
 */
export function evaluateVariableContextNumeric(
  variables: VariableDefinition[]
): Record<string, number> {
  const context: Record<string, number> = { ...BUILTIN_CONSTANTS }

  for (const v of variables) {
    try {
      const value = evaluateExpression(v.expression, context)
      context[v.name] = value
    } catch {
      // skip failed variables
    }
  }

  // Return only user variables (exclude builtins)
  const result: Record<string, number> = {}
  for (const v of variables) {
    if (v.name in context) {
      result[v.name] = context[v.name]
    }
  }
  return result
}

/**
 * Format a number for display (compact engineering notation).
 */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return String(value)

  const abs = Math.abs(value)

  // Very large or very small: use scientific notation
  if (abs >= 1e9 || (abs > 0 && abs < 1e-3)) {
    return value.toExponential(4)
  }

  // Normal range: up to 6 significant figures
  if (Number.isInteger(value)) return value.toString()
  return parseFloat(value.toPrecision(6)).toString()
}
