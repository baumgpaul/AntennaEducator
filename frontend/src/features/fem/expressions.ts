/**
 * Safe arithmetic expressions, the same language as the backend
 * (mesher/src/fem_mesher/expressions.py): numbers, + - * / ** (also ^),
 * parentheses, parameter names, pi, and sqrt sin cos tan atan2 abs min max.
 * Used to draw the geometry instantly while the user edits dimensions.
 */

export type Expr = number | string;

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atan2: Math.atan2,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

export class ExpressionError extends Error {}

type Token = { kind: 'num' | 'name' | 'op'; text: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/^(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new ExpressionError(`Unexpected character in "${src}"`);
    if (m[1] !== undefined) tokens.push({ kind: 'num', text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: 'name', text: m[2] });
    else tokens.push({ kind: 'op', text: m[3] === '^' ? '**' : m[3] });
    pos = re.lastIndex;
  }
  return tokens;
}

/** Value of a number or an expression over the given names. */
export function evaluate(expr: Expr, names: Record<string, number>): number {
  if (typeof expr === 'number') return expr;
  const tokens = tokenize(expr);
  let i = 0;
  const peek = () => tokens[i]?.text;
  const take = (text?: string) => {
    const t = tokens[i];
    if (!t || (text !== undefined && t.text !== text)) {
      throw new ExpressionError(`Expected ${text ?? 'a value'} in "${expr}"`);
    }
    i++;
    return t;
  };

  // sum := term (('+'|'-') term)*   term := unary (('*'|'/') unary)*
  // unary := '-' unary | power      power := atom ('**' unary)?
  const sum = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = take().text === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (peek() === '*' || peek() === '/') v = take().text === '*' ? v * unary() : v / unary();
    return v;
  };
  const unary = (): number => {
    if (peek() === '-') {
      take();
      return -unary();
    }
    if (peek() === '+') {
      take();
      return unary();
    }
    return power();
  };
  const power = (): number => {
    const base = atom();
    if (peek() !== '**') return base;
    take();
    return base ** unary();
  };
  const atom = (): number => {
    const t = take();
    if (t.kind === 'num') return Number(t.text);
    if (t.text === '(') {
      const v = sum();
      take(')');
      return v;
    }
    if (t.kind === 'name') {
      if (peek() === '(' && t.text in FUNCTIONS) {
        take('(');
        const args = [sum()];
        while (peek() === ',') {
          take();
          args.push(sum());
        }
        take(')');
        return FUNCTIONS[t.text](...args);
      }
      if (t.text in names) return names[t.text];
      if (t.text === 'pi') return Math.PI;
      throw new ExpressionError(`Unknown parameter "${t.text}"`);
    }
    throw new ExpressionError(`Unexpected "${t.text}" in "${expr}"`);
  };

  if (tokens.length === 0) throw new ExpressionError('Empty expression');
  const value = sum();
  if (i !== tokens.length) throw new ExpressionError(`Unexpected "${tokens[i].text}" in "${expr}"`);
  return value;
}

/** Parameters in order; each may use the ones before it. */
export function evaluateParameters(parameters: Record<string, Expr>): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [name, expr] of Object.entries(parameters)) values[name] = evaluate(expr, values);
  return values;
}

/** True if the expression uses x or y (space-dependent value). */
export function dependsOnSpace(expr: Expr): boolean {
  return typeof expr === 'string' && /\b[xy]\b/.test(expr);
}
