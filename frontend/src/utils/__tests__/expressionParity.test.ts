import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateExpression } from '../expressionEvaluator';

// Shared with tests/unit/test_expression_parity.py — the backend is the reference (B22)
interface ParityCase {
  expr: string;
  vars?: Record<string, number>;
  value?: number;
  error?: boolean;
}
const { cases } = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tests/fixtures/expression_parity.json'), 'utf-8'),
) as { cases: ParityCase[] };

describe('expression parity with the backend (B22)', () => {
  it.each(cases.map((c) => [c.expr, c] as const))('%s', (_expr, c) => {
    if (c.error) {
      expect(() => evaluateExpression(c.expr, c.vars)).toThrow();
    } else {
      expect(evaluateExpression(c.expr, c.vars)).toBeCloseTo(c.value!, 10);
    }
  });
});
