/**
 * PortQuantityTable — tabular view of port-level quantities (impedance,
 * reflection coefficient, return loss, VSWR) per frequency or swept variable.
 */
import React from 'react';
import type { TableColumn } from '@/types/plotDefinitions';
import type { FrequencySweepResult } from '@/types/api';
import type { ParameterStudyResult } from '@/types/parameterStudy';

// ============================================================================
// Complex helpers (mirrored from plotDataExtractors to avoid circular deps)
// ============================================================================

interface ComplexLike {
  real: number;
  imag: number;
}

function parseComplex(v: unknown): ComplexLike {
  if (v == null) return { real: 0, imag: 0 };
  if (typeof v === 'object' && v !== null && 'real' in v && 'imag' in v) {
    return { real: (v as any).real, imag: (v as any).imag };
  }
  if (typeof v === 'number') return { real: v, imag: 0 };
  return { real: 0, imag: 0 };
}

function complexMag(z: ComplexLike): number {
  return Math.sqrt(z.real ** 2 + z.imag ** 2);
}

function complexPhaseDeg(z: ComplexLike): number {
  return (Math.atan2(z.imag, z.real) * 180) / Math.PI;
}

function reflectionCoefficient(z: ComplexLike, z0: number): ComplexLike {
  const denR = z.real + z0;
  const denI = z.imag;
  const denMag2 = denR * denR + denI * denI;
  if (denMag2 < 1e-30) return { real: 1, imag: 0 };
  const numR = z.real - z0;
  const numI = z.imag;
  return {
    real: (numR * denR + numI * denI) / denMag2,
    imag: (numI * denR - numR * denI) / denMag2,
  };
}

// ============================================================================
// Row data builder
// ============================================================================

interface RowData {
  [key: string]: number;
}

function buildRow(
  xValue: number,
  z: ComplexLike,
  z0: number,
  xKey: string,
): RowData {
  const gamma = reflectionCoefficient(z, z0);
  const gMag = complexMag(gamma);
  return {
    [xKey]: xValue,
    zReal: z.real,
    zImag: z.imag,
    zMag: complexMag(z),
    zPhase: complexPhaseDeg(z),
    gammaMag: gMag,
    returnLoss: gMag < 1e-10 ? 80 : -20 * Math.log10(gMag),
    vswr: gMag >= 1 ? Infinity : (1 + gMag) / (1 - gMag),
  };
}

function extractRows(
  frequencySweep: FrequencySweepResult | null,
  parameterStudy: ParameterStudyResult | null,
  antennaIndex: number,
  z0: number,
): RowData[] {
  if (parameterStudy && parameterStudy.results.length > 0) {
    const varName =
      parameterStudy.config.sweepVariables[0]?.variableName ?? '';
    return parameterStudy.results.map((pr) => {
      const sol = (pr.solverResponse as any)?.antenna_solutions?.[
        antennaIndex
      ];
      const z = parseComplex(sol?.input_impedance);
      const xVal = varName ? (pr.point.values[varName] ?? 0) : 0;
      return buildRow(xVal, z, z0, varName || 'frequency');
    });
  }

  if (frequencySweep && frequencySweep.results.length > 0) {
    return frequencySweep.results.map((result, i) => {
      const sol = result.antenna_solutions?.[antennaIndex];
      const z = parseComplex(sol?.input_impedance);
      const freq =
        (frequencySweep.frequencies[i] ?? result.frequency) / 1e6; // to MHz
      return buildRow(freq, z, z0, 'frequency');
    });
  }

  return [];
}

// ============================================================================
// Component
// ============================================================================

export interface PortQuantityTableProps {
  columns: TableColumn[];
  frequencySweep: FrequencySweepResult | null;
  parameterStudy: ParameterStudyResult | null;
  antennaIndex?: number;
  z0?: number;
  title?: string;
}

export const PortQuantityTable: React.FC<PortQuantityTableProps> = ({
  columns,
  frequencySweep,
  parameterStudy,
  antennaIndex = 0,
  z0 = 50,
  title,
}) => {
  const rows = extractRows(frequencySweep, parameterStudy, antennaIndex, z0);

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
        No data available
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {title && (
        <div
          style={{
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {title}
        </div>
      )}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  borderBottom: '2px solid #ddd',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
                {col.unit ? ` (${col.unit})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '4px 12px',
                    textAlign: 'right',
                    borderBottom: '1px solid #eee',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatCell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function formatCell(value: number | undefined): string {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(2);
}
