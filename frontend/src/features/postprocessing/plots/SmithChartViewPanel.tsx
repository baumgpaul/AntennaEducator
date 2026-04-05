/**
 * SmithChartViewPanel — wrapper that extracts impedance data from
 * frequency sweep or parameter study and renders SmithChart.
 */
import React from 'react';
import { SmithChart, type SmithChartPoint } from './SmithChart';
import type { SmithDataSource } from '@/types/plotDefinitions';
import type { FrequencySweepResult } from '@/types/api';
import type { ParameterStudyResult } from '@/types/parameterStudy';

// ============================================================================
// Helpers
// ============================================================================

function parseComplex(v: unknown): { real: number; imag: number } {
  if (v == null) return { real: 0, imag: 0 };
  if (typeof v === 'object' && v !== null && 'real' in v && 'imag' in v) {
    return { real: (v as any).real, imag: (v as any).imag };
  }
  if (typeof v === 'number') return { real: v, imag: 0 };
  if (typeof v === 'string') {
    const cleaned = v.replace(/[()]/g, '');
    const match = cleaned.match(/^([+-]?[\d.eE+-]+)([+-][\d.eE+-]+)[jJ]$/);
    if (match) {
      return { real: parseFloat(match[1]), imag: parseFloat(match[2]) };
    }
    const imagMatch = cleaned.match(/^([+-]?[\d.eE+-]+)[jJ]$/);
    if (imagMatch) {
      return { real: 0, imag: parseFloat(imagMatch[1]) };
    }
    const realOnly = parseFloat(cleaned);
    if (!isNaN(realOnly)) return { real: realOnly, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

function extractFromSweep(
  sweep: FrequencySweepResult,
  antennaIndex: number,
): SmithChartPoint[] {
  return sweep.results.map((result, i) => {
    const sol = result.antenna_solutions?.[antennaIndex];
    const z = parseComplex(sol?.input_impedance);
    const freqMHz = (sweep.frequencies[i] ?? result.frequency) / 1e6;
    return {
      zReal: z.real,
      zImag: z.imag,
      label: `${freqMHz.toFixed(1)} MHz`,
    };
  });
}

function extractFromParamStudy(
  study: ParameterStudyResult,
  antennaIndex: number,
): SmithChartPoint[] {
  const varName = study.config.sweepVariables[0]?.variableName ?? '';
  return study.results.map((pr) => {
    const sol = (pr.solverResponse as any)?.antenna_solutions?.[antennaIndex];
    const z = parseComplex(sol?.input_impedance);
    const xVal = varName ? (pr.point.values[varName] ?? 0) : 0;
    return {
      zReal: z.real,
      zImag: z.imag,
      label: varName ? `${varName}=${xVal}` : undefined,
    };
  });
}

// ============================================================================
// Component
// ============================================================================

export interface SmithChartViewPanelProps {
  dataSource: SmithDataSource;
  frequencySweep: FrequencySweepResult | null;
  parameterStudy: ParameterStudyResult | null;
  antennaIndex?: number;
  z0?: number;
  title?: string;
  size?: number;
}

export const SmithChartViewPanel: React.FC<SmithChartViewPanelProps> = ({
  dataSource,
  frequencySweep,
  parameterStudy,
  antennaIndex = 0,
  z0 = 50,
  title,
  size,
}) => {
  let points: SmithChartPoint[] = [];

  if (
    dataSource === 'parameter-study' &&
    parameterStudy &&
    parameterStudy.results.length > 0
  ) {
    points = extractFromParamStudy(parameterStudy, antennaIndex);
  } else if (frequencySweep && frequencySweep.results.length > 0) {
    points = extractFromSweep(frequencySweep, antennaIndex);
  }

  if (points.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
        No data available
      </div>
    );
  }

  return (
    <SmithChart data={points} z0={z0} title={title} size={size} vswrCircles={[1.5, 2, 3]} />
  );
};
