/**
 * Client-side data export: CSV of plot curves, JSON of solver results, file download.
 */
import type { PlotTrace } from '@/types/plotDefinitions';
import type { DataPoint } from '@/types/plotDataExtractors';

/** Turn a view/plot name into a safe file name (keeps letters, digits, - and _). */
export function safeFilename(name: string, fallback = 'export'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned || fallback;
}

function csvCell(value: string | number | undefined): string {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per distinct x value, one column per trace. Traces with different
 * x samples (e.g. after a re-solve) leave empty cells instead of being misaligned.
 */
export function tracesToCSV(
  traces: PlotTrace[],
  traceData: Record<string, DataPoint[]>,
  xHeader: string,
): string {
  const xs = new Set<number>();
  const byTrace = traces.map((trace) => {
    const map = new Map<number, number>();
    for (const p of traceData[trace.id] ?? []) {
      xs.add(p.x);
      map.set(p.x, p.y);
    }
    return map;
  });
  const header = [xHeader, ...traces.map((t) => t.label || t.id)].map(csvCell).join(',');
  const rows = [...xs]
    .sort((a, b) => a - b)
    .map((x) => [x, ...byTrace.map((m) => m.get(x))].map(csvCell).join(','));
  return [header, ...rows].join('\n') + '\n';
}

/** Header text for an axis, e.g. "Frequency [MHz]". */
export function axisHeader(axis: { label?: string; unit?: string } | undefined, fallback: string): string {
  const label = axis?.label || fallback;
  return axis?.unit ? `${label} [${axis.unit}]` : label;
}

/** Trigger a browser download of text or a data URL. */
export function downloadFile(content: string, filename: string, mime: string): void {
  const isDataUrl = content.startsWith('data:');
  const url = isDataUrl ? content : URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (!isDataUrl) URL.revokeObjectURL(url);
}

interface ResultsSource {
  solver: {
    solveMode?: unknown;
    multiAntennaResults?: unknown;
    frequencySweep?: { frequencies?: number[]; results?: unknown[] } | null;
    parameterStudy?: {
      config?: unknown;
      results?: Array<{ point: unknown; solverResponse: unknown; converged: boolean }>;
    } | null;
    radiationPattern?: unknown;
    radiationPatterns?: unknown;
  };
}

/**
 * Raw solver results of the open project as JSON: single-frequency solution,
 * frequency sweep, parameter study (without mesh snapshots) and far-field
 * patterns. Field data is left out (large; use the ParaView export).
 */
export function buildResultsJSON(state: ResultsSource, project: { id?: unknown; name?: string } | null): string {
  const { solver } = state;
  const study = solver.parameterStudy;
  return JSON.stringify(
    {
      format: 'antenna-educator-results',
      version: 1,
      exported_at: new Date().toISOString(),
      project: project ? { id: project.id, name: project.name } : null,
      solve_mode: solver.solveMode ?? null,
      single_frequency: solver.multiAntennaResults ?? null,
      frequency_sweep: solver.frequencySweep
        ? { frequencies: solver.frequencySweep.frequencies, results: solver.frequencySweep.results }
        : null,
      parameter_study: study
        ? {
            config: study.config,
            results: (study.results ?? []).map(({ point, solverResponse, converged }) => ({
              point,
              solverResponse,
              converged,
            })),
          }
        : null,
      radiation_patterns: solver.radiationPatterns ?? solver.radiationPattern ?? null,
    },
    null,
    2,
  );
}
