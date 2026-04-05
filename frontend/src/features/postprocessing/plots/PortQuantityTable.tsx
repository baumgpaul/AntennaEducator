/**
 * PortQuantityTable — tabular view of port-level quantities (impedance,
 * reflection coefficient, return loss, VSWR) per frequency or swept variable.
 *
 * Features: sortable columns, CSV export, engineering notation,
 * all sweep variables included as columns.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
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
// Engineering notation formatter
// ============================================================================

const SI_PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'μ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

function formatEngineering(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (value === 0) return '0';
  const absVal = Math.abs(value);
  for (const [threshold, prefix] of SI_PREFIXES) {
    if (absVal >= threshold * 0.9995) {
      return (value / threshold).toFixed(decimals).replace(/\.?0+$/, '') + prefix;
    }
  }
  return value.toExponential(decimals);
}

function formatCell(value: number | undefined, useEng = true): string {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '∞';
  if (useEng) return formatEngineering(value);
  return value.toFixed(4);
}

// ============================================================================
// Row data builder
// ============================================================================

interface RowData {
  [key: string]: number;
}

function buildRow(
  sweepValues: Record<string, number>,
  z: ComplexLike,
  z0: number,
): RowData {
  const gamma = reflectionCoefficient(z, z0);
  const gMag = complexMag(gamma);
  return {
    ...sweepValues,
    zReal: z.real,
    zImag: z.imag,
    zMag: complexMag(z),
    zPhase: complexPhaseDeg(z),
    gammaMag: gMag,
    returnLoss: gMag < 1e-10 ? 80 : -20 * Math.log10(gMag),
    vswr: gMag >= 1 ? Infinity : (1 + gMag) / (1 - gMag),
  };
}

/** Build column definitions dynamically from sweep variables + fixed quantity columns. */
function buildColumns(
  parameterStudy: ParameterStudyResult | null,
  baseColumns: TableColumn[],
): TableColumn[] {
  if (parameterStudy && parameterStudy.config.sweepVariables.length > 0) {
    const varCols: TableColumn[] = parameterStudy.config.sweepVariables.map((sv) => ({
      key: sv.variableName,
      label: sv.variableName,
      unit: sv.variableName.toLowerCase().includes('freq') ? 'Hz' : '',
    }));
    // Remove 'frequency' column from base — sweep variables replace it.
    // Also remove any column whose key matches a sweep variable name.
    const filteredBase = baseColumns.filter(
      (c) =>
        c.key !== 'frequency' &&
        !varCols.some((vc) => vc.key === c.key),
    );
    return [...varCols, ...filteredBase];
  }
  return baseColumns;
}

function extractRows(
  frequencySweep: FrequencySweepResult | null,
  parameterStudy: ParameterStudyResult | null,
  antennaIndex: number,
  z0: number,
): RowData[] {
  if (parameterStudy && parameterStudy.results.length > 0) {
    return parameterStudy.results.map((pr) => {
      const sol = (pr.solverResponse as any)?.antenna_solutions?.[antennaIndex];
      const z = parseComplex(sol?.input_impedance);
      // Include ALL sweep variable values
      const sweepValues: Record<string, number> = {};
      for (const sv of parameterStudy.config.sweepVariables) {
        sweepValues[sv.variableName] = pr.point.values[sv.variableName] ?? 0;
      }
      return buildRow(sweepValues, z, z0);
    });
  }

  if (frequencySweep && frequencySweep.results.length > 0) {
    return frequencySweep.results.map((result, i) => {
      const sol = result.antenna_solutions?.[antennaIndex];
      const z = parseComplex(sol?.input_impedance);
      const freq = frequencySweep.frequencies[i] ?? result.frequency;
      return buildRow({ frequency: freq / 1e6 }, z, z0);
    });
  }

  return [];
}

// ============================================================================
// CSV export
// ============================================================================

function exportCSV(columns: TableColumn[], rows: RowData[], filename = 'port_quantities.csv') {
  const header = columns.map((c) => `${c.label}${c.unit ? ` (${c.unit})` : ''}`).join(',');
  const body = rows
    .map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        if (v == null) return '';
        if (!Number.isFinite(v)) return 'Inf';
        return v.toString();
      }).join(','),
    )
    .join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

type SortDir = 'asc' | 'desc';

export const PortQuantityTable: React.FC<PortQuantityTableProps> = ({
  columns: baseColumns,
  frequencySweep,
  parameterStudy,
  antennaIndex = 0,
  z0 = 50,
  title,
}) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const columns = useMemo(
    () => buildColumns(parameterStudy, baseColumns),
    [parameterStudy, baseColumns],
  );

  const rows = useMemo(
    () => extractRows(frequencySweep, parameterStudy, antennaIndex, z0),
    [frequencySweep, parameterStudy, antennaIndex, z0],
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const handleExport = useCallback(() => {
    exportCSV(columns, sortedRows);
  }, [columns, sortedRows]);

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">No data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title || 'Port Quantities'}
        </Typography>
        <Tooltip title="Export CSV">
          <IconButton size="small" onClick={handleExport}>
            <FileDownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  align="right"
                  sortDirection={sortKey === col.key ? sortDir : false}
                  sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : 'asc'}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {col.unit ? ` (${col.unit})` : ''}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row, i) => (
              <TableRow key={i} hover>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    align="right"
                    sx={{ fontFamily: 'monospace', fontSize: 12 }}
                  >
                    {formatCell(row[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" sx={{ px: 2, py: 0.5, color: 'text.secondary', display: 'block' }}>
        {rows.length} rows · Z₀ = {z0} Ω
      </Typography>
    </Box>
  );
};
