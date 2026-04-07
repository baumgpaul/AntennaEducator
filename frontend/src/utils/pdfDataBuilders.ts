/**
 * pdfDataBuilders — Pure functions that extract and format data from
 * Redux state objects into structured table rows suitable for PDF generation.
 *
 * All functions are side-effect-free and easy to unit test.
 */

import type { AntennaElement } from '@/types/models';
import type { VariableDefinition } from '@/utils/expressionEvaluator';
import { evaluateVariableContext } from '@/utils/expressionEvaluator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TableRow {
  /** Cell values in column order. */
  cells: string[];
}

export interface PDFTableSection {
  title: string;
  headers: string[];
  rows: TableRow[];
}

export interface SubmissionMeta {
  studentName: string;
  submittedAt: string;
  status: string;
  feedback?: string;
}

export interface CoverPageData {
  projectName: string;
  authorName?: string;
  exportDate: string;
  courseName?: string;
  submission?: SubmissionMeta;
}

export interface KeyParam {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a frequency in Hz to a human-readable string with appropriate units.
 * Uses GHz ≥ 1 GHz, MHz ≥ 1 MHz, kHz ≥ 1 kHz, Hz otherwise.
 */
export function formatFrequency(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
  return `${hz.toFixed(1)} Hz`;
}

/**
 * Format a length in metres to a human-readable string.
 * Uses m ≥ 1 m, cm ≥ 0.01 m, mm otherwise.
 */
export function formatLength(metres: number): string {
  if (Math.abs(metres) >= 1) return `${metres.toFixed(3)} m`;
  if (Math.abs(metres) >= 0.01) return `${(metres * 100).toFixed(2)} cm`;
  return `${(metres * 1000).toFixed(2)} mm`;
}

/**
 * Strip basic Markdown syntax from a string to produce readable plain text.
 * Handles: headings, bold, italic, inline code, links, images, HR.
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')            // headings
    .replace(/!\[.*?\]\(.*?\)/g, '')         // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')  // links → label only
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold**
    .replace(/__([^_]+)__/g, '$1')           // __bold__
    .replace(/\*([^*]+)\*/g, '$1')           // *italic*
    .replace(/_([^_]+)_/g, '$1')             // _italic_
    .replace(/`([^`]+)`/g, '$1')             // `code`
    .replace(/^[-*]{3,}$/gm, '')             // HR lines
    .replace(/^\s*[-*+]\s+/gm, '• ')         // unordered lists
    .replace(/^\s*\d+\.\s+/gm, '')           // ordered lists
    .trim();
}

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

/** Return the human-readable type label for an antenna element. */
function elementTypeLabel(type: AntennaElement['type']): string {
  switch (type) {
    case 'dipole': return 'Dipole';
    case 'loop': return 'Loop';
    case 'rod': return 'Rod';
    case 'custom': return 'Custom';
    default: return type;
  }
}

/**
 * Return key parameter label/value pairs for a given antenna element.
 * These are the most important geometry parameters shown in the PDF summary.
 */
export function getElementKeyParams(element: AntennaElement): KeyParam[] {
  const cfg = element.config as unknown as Record<string, unknown>;
  const params: KeyParam[] = [];

  switch (element.type) {
    case 'dipole': {
      if (typeof cfg.length === 'number') {
        params.push({ label: 'Length', value: formatLength(cfg.length) });
      }
      if (typeof cfg.radius === 'number') {
        params.push({ label: 'Radius', value: formatLength(cfg.radius) });
      }
      if (Array.isArray(cfg.orientation)) {
        const [ox, oy, oz] = cfg.orientation as number[];
        params.push({ label: 'Orientation', value: `(${ox.toFixed(2)}, ${oy.toFixed(2)}, ${oz.toFixed(2)})` });
      }
      break;
    }
    case 'loop': {
      if (typeof cfg.radius === 'number') {
        params.push({ label: 'Radius', value: formatLength(cfg.radius) });
      }
      if (typeof cfg.wire_radius === 'number') {
        params.push({ label: 'Wire Radius', value: formatLength(cfg.wire_radius) });
      }
      break;
    }
    case 'rod': {
      const start = cfg.start as number[] | undefined;
      const end = cfg.end as number[] | undefined;
      if (start) {
        params.push({ label: 'Start', value: `(${start.map(v => v.toFixed(3)).join(', ')}) m` });
      }
      if (end) {
        params.push({ label: 'End', value: `(${end.map(v => v.toFixed(3)).join(', ')}) m` });
      }
      if (typeof cfg.radius === 'number') {
        params.push({ label: 'Radius', value: formatLength(cfg.radius) });
      }
      break;
    }
    case 'custom': {
      // For custom, key params come from the mesh itself
      const nodeCount = element.mesh?.nodes?.length ?? 0;
      const edgeCount = element.mesh?.edges?.length ?? 0;
      params.push({ label: 'Nodes', value: String(nodeCount) });
      params.push({ label: 'Edges', value: String(edgeCount) });
      break;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Table section builders
// ---------------------------------------------------------------------------

/**
 * Build the Antenna Design Summary table section.
 * Columns: #, Name, Type, Key Parameters, Nodes, Edges
 */
export function buildAntennaSummaryRows(elements: AntennaElement[]): PDFTableSection {
  return {
    title: 'Antenna Design Summary',
    headers: ['#', 'Name', 'Type', 'Key Parameters', 'Nodes', 'Edges'],
    rows: elements.map((el, idx) => {
      const keyParams = getElementKeyParams(el);
      const paramStr = keyParams.map(p => `${p.label}: ${p.value}`).join(', ');
      const nodeCount = el.mesh?.nodes?.length ?? 0;
      const edgeCount = el.mesh?.edges?.length ?? 0;
      return {
        cells: [
          String(idx + 1),
          el.name,
          elementTypeLabel(el.type),
          paramStr,
          String(nodeCount),
          String(edgeCount),
        ],
      };
    }),
  };
}

/**
 * Build the Variable Definitions table section.
 * Columns: Name, Expression, Value, Unit
 */
export function buildVariableRows(variables: VariableDefinition[]): PDFTableSection {
  // Evaluate all variables to get their resolved numeric values
  const evaluated = evaluateVariableContext(variables);

  return {
    title: 'Variable Definitions',
    headers: ['Name', 'Expression', 'Value', 'Unit'],
    rows: variables.map(v => {
      const result = evaluated[v.name];
      let valueStr = '';
      if (typeof result === 'number') {
        // Format with up to 6 significant figures, strip trailing zeros
        valueStr = parseFloat(result.toPrecision(6)).toString();
      } else if (typeof result === 'string') {
        valueStr = result; // error message
      }
      return {
        cells: [v.name, v.expression, valueStr, v.unit ?? ''],
      };
    }),
  };
}

/**
 * Build the Solver Configuration table section.
 * Columns: Setting, Value
 */
export function buildSolverConfigRows(
  config: {
    frequency?: number;
    z0?: number;
    numFrequencies?: number;
    sweepStart?: number;
    sweepEnd?: number;
    method?: string;
  } | null,
): PDFTableSection {
  const rows: TableRow[] = [];

  if (!config) {
    return { title: 'Solver Configuration', headers: ['Setting', 'Value'], rows };
  }

  if (config.sweepStart !== undefined && config.sweepEnd !== undefined) {
    rows.push({
      cells: [
        'Sweep Range',
        `${formatFrequency(config.sweepStart)} – ${formatFrequency(config.sweepEnd)}`,
      ],
    });
    if (config.numFrequencies !== undefined) {
      rows.push({ cells: ['Frequency Points', String(config.numFrequencies)] });
    }
  } else if (config.frequency !== undefined) {
    rows.push({ cells: ['Frequency', formatFrequency(config.frequency)] });
  }

  if (config.z0 !== undefined) {
    rows.push({ cells: ['Reference Impedance (Z₀)', `${config.z0} Ω`] });
  }

  if (config.method) {
    rows.push({ cells: ['Solver Method', config.method.toUpperCase()] });
  }

  return { title: 'Solver Configuration', headers: ['Setting', 'Value'], rows };
}

/**
 * Build cover page data from project metadata.
 */
export function buildCoverPageData(options: {
  projectName: string;
  authorName?: string;
  courseName?: string;
  submission?: SubmissionMeta;
}): CoverPageData {
  return {
    projectName: options.projectName,
    authorName: options.authorName,
    exportDate: new Date().toLocaleString(),
    courseName: options.courseName,
    submission: options.submission,
  };
}
