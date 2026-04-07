/**
 * Tests for pdfDataBuilders — pure functions that extract data from
 * Redux-state objects and convert them into table rows for PDF generation.
 */
import { describe, it, expect } from 'vitest';
import type { AntennaElement } from '@/types/models';
import type { VariableDefinition } from '@/utils/expressionEvaluator';
import {
  buildAntennaSummaryRows,
  buildVariableRows,
  buildSolverConfigRows,
  buildCoverPageData,
  formatFrequency,
  formatLength,
  stripMarkdown,
  getElementKeyParams,
} from '../pdfDataBuilders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dipoleElement: AntennaElement = {
  id: 'el-1',
  type: 'dipole',
  name: 'Half-wave Dipole',
  config: {
    length: 0.5,
    radius: 0.001,
    num_segments: 10,
    gap_width: 0.0,
    orientation: [0, 0, 1],
    center_position: [0, 0, 0],
  } as any,
  position: [0, 0, 0] as any,
  rotation: [0, 0, 0] as any,
  mesh: { nodes: [], edges: [], radii: [], source_edges: [] } as any,
  visible: true,
  locked: false,
};

const rodElement: AntennaElement = {
  id: 'el-2',
  type: 'rod',
  name: 'Quarter-wave Rod',
  config: {
    start: [0, 0, 0],
    end: [0, 0, 0.25],
    radius: 0.001,
    num_segments: 5,
  } as any,
  position: [0, 0, 0] as any,
  rotation: [0, 0, 0] as any,
  mesh: { nodes: [], edges: [], radii: [], source_edges: [] } as any,
  visible: true,
  locked: false,
};

const customElement: AntennaElement = {
  id: 'el-3',
  type: 'custom',
  name: 'Custom Yagi',
  config: {} as any,
  position: [0, 0, 0] as any,
  rotation: [0, 0, 0] as any,
  mesh: {
    nodes: [[0, 0, 0], [0, 0, 1], [0, 0, 2]] as any,
    edges: [[1, 2], [2, 3]] as any,
    radii: [0.001, 0.001],
    source_edges: [],
  } as any,
  visible: true,
  locked: false,
};

const variables: VariableDefinition[] = [
  { name: 'freq', expression: '300e6', unit: 'Hz' },
  { name: 'wavelength', expression: 'C_0 / freq', unit: 'm' },
  { name: 'arm_length', expression: 'wavelength / 4', unit: 'm' },
];

// ---------------------------------------------------------------------------
// formatFrequency
// ---------------------------------------------------------------------------

describe('formatFrequency', () => {
  it('formats Hz as GHz when >= 1e9', () => {
    expect(formatFrequency(1e9)).toBe('1.000 GHz');
    expect(formatFrequency(2.45e9)).toBe('2.450 GHz');
  });

  it('formats Hz as MHz when >= 1e6', () => {
    expect(formatFrequency(300e6)).toBe('300.0 MHz');
    expect(formatFrequency(433.92e6)).toBe('433.9 MHz');
  });

  it('formats Hz as kHz when >= 1e3', () => {
    expect(formatFrequency(1000)).toBe('1.000 kHz');
  });

  it('formats Hz directly when < 1000', () => {
    expect(formatFrequency(50)).toBe('50.0 Hz');
  });
});

// ---------------------------------------------------------------------------
// formatLength
// ---------------------------------------------------------------------------

describe('formatLength', () => {
  it('formats metres >= 1 with 3 decimal places', () => {
    expect(formatLength(1.5)).toBe('1.500 m');
  });

  it('formats cm when in range 0.01..1', () => {
    expect(formatLength(0.075)).toBe('7.50 cm');
  });

  it('formats mm when < 0.01', () => {
    expect(formatLength(0.001)).toBe('1.00 mm');
  });
});

// ---------------------------------------------------------------------------
// getElementKeyParams
// ---------------------------------------------------------------------------

describe('getElementKeyParams', () => {
  it('returns length and radius for dipole', () => {
    const params = getElementKeyParams(dipoleElement);
    expect(params).toContainEqual(expect.objectContaining({ label: 'Length' }));
    expect(params).toContainEqual(expect.objectContaining({ label: 'Radius' }));
    expect(params.find(p => p.label === 'Length')?.value).toBe('50.00 cm');
  });

  it('returns start, end and radius for rod', () => {
    const params = getElementKeyParams(rodElement);
    expect(params).toContainEqual(expect.objectContaining({ label: 'Start' }));
    expect(params).toContainEqual(expect.objectContaining({ label: 'End' }));
  });

  it('returns node/edge count for custom', () => {
    const params = getElementKeyParams(customElement);
    expect(params).toContainEqual({ label: 'Nodes', value: '3' });
    expect(params).toContainEqual({ label: 'Edges', value: '2' });
  });
});

// ---------------------------------------------------------------------------
// buildAntennaSummaryRows
// ---------------------------------------------------------------------------

describe('buildAntennaSummaryRows', () => {
  it('returns a section with correct headers', () => {
    const section = buildAntennaSummaryRows([dipoleElement]);
    expect(section.headers).toEqual(['#', 'Name', 'Type', 'Key Parameters', 'Nodes', 'Edges']);
  });

  it('has one row per element', () => {
    const section = buildAntennaSummaryRows([dipoleElement, rodElement, customElement]);
    expect(section.rows).toHaveLength(3);
  });

  it('row contains element name and type', () => {
    const section = buildAntennaSummaryRows([dipoleElement]);
    const row = section.rows[0];
    expect(row.cells[1]).toBe('Half-wave Dipole');
    expect(row.cells[2]).toBe('Dipole');
  });

  it('includes node/edge counts from mesh', () => {
    const section = buildAntennaSummaryRows([customElement]);
    const row = section.rows[0];
    expect(row.cells[4]).toBe('3');
    expect(row.cells[5]).toBe('2');
  });

  it('returns empty rows for empty element list', () => {
    const section = buildAntennaSummaryRows([]);
    expect(section.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildVariableRows
// ---------------------------------------------------------------------------

describe('buildVariableRows', () => {
  it('returns a section with correct headers', () => {
    const section = buildVariableRows(variables);
    expect(section.headers).toEqual(['Name', 'Expression', 'Value', 'Unit']);
  });

  it('has one row per variable', () => {
    const section = buildVariableRows(variables);
    expect(section.rows).toHaveLength(3);
  });

  it('row contains name and expression', () => {
    const section = buildVariableRows(variables);
    expect(section.rows[0].cells[0]).toBe('freq');
    expect(section.rows[0].cells[1]).toBe('300e6');
    expect(section.rows[0].cells[3]).toBe('Hz');
  });

  it('row evaluates numeric expressions to formatted values', () => {
    const section = buildVariableRows([{ name: 'x', expression: '42', unit: '' }]);
    expect(section.rows[0].cells[2]).toBe('42');
  });

  it('returns empty rows for empty variable list', () => {
    const section = buildVariableRows([]);
    expect(section.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSolverConfigRows
// ---------------------------------------------------------------------------

describe('buildSolverConfigRows', () => {
  it('returns null-safe section when config is null', () => {
    const section = buildSolverConfigRows(null);
    expect(section.rows).toHaveLength(0);
  });

  it('includes frequency formatted in MHz', () => {
    const section = buildSolverConfigRows({ frequency: 300e6, z0: 50, method: 'peec' });
    const freqRow = section.rows.find(r => r.cells[0] === 'Frequency');
    expect(freqRow).toBeDefined();
    expect(freqRow!.cells[1]).toBe('300.0 MHz');
  });

  it('includes Z0 in ohms', () => {
    const section = buildSolverConfigRows({ frequency: 300e6, z0: 50, method: 'peec' });
    const z0Row = section.rows.find(r => r.cells[0] === 'Reference Impedance (Z₀)');
    expect(z0Row).toBeDefined();
    expect(z0Row!.cells[1]).toBe('50 Ω');
  });

  it('includes sweep range when provided', () => {
    const section = buildSolverConfigRows({
      sweepStart: 200e6,
      sweepEnd: 400e6,
      numFrequencies: 51,
    });
    const rangeRow = section.rows.find(r => r.cells[0] === 'Sweep Range');
    expect(rangeRow).toBeDefined();
    expect(rangeRow!.cells[1]).toContain('200.0 MHz');
    expect(rangeRow!.cells[1]).toContain('400.0 MHz');
  });

  it('includes method when provided', () => {
    const section = buildSolverConfigRows({ method: 'peec' });
    const methodRow = section.rows.find(r => r.cells[0] === 'Solver Method');
    expect(methodRow).toBeDefined();
    expect(methodRow!.cells[1]).toMatch(/peec/i);
  });
});

// ---------------------------------------------------------------------------
// buildCoverPageData
// ---------------------------------------------------------------------------

describe('buildCoverPageData', () => {
  it('sets project name', () => {
    const data = buildCoverPageData({ projectName: 'Antenna Sim 1' });
    expect(data.projectName).toBe('Antenna Sim 1');
  });

  it('sets author name when provided', () => {
    const data = buildCoverPageData({ projectName: 'MyProject', authorName: 'Alice' });
    expect(data.authorName).toBe('Alice');
  });

  it('sets exportDate as a non-empty string', () => {
    const data = buildCoverPageData({ projectName: 'X' });
    expect(typeof data.exportDate).toBe('string');
    expect(data.exportDate.length).toBeGreaterThan(0);
  });

  it('includes submission metadata when provided', () => {
    const data = buildCoverPageData({
      projectName: 'Lab 1',
      submission: {
        studentName: 'Bob',
        submittedAt: '2026-04-01T10:00:00Z',
        status: 'reviewed',
        feedback: 'Good work!',
      },
    });
    expect(data.submission?.studentName).toBe('Bob');
    expect(data.submission?.feedback).toBe('Good work!');
    expect(data.submission?.status).toBe('reviewed');
  });

  it('includes course name when provided', () => {
    const data = buildCoverPageData({ projectName: 'X', courseName: 'EM Theory 101' });
    expect(data.courseName).toBe('EM Theory 101');
  });
});

// ---------------------------------------------------------------------------
// stripMarkdown
// ---------------------------------------------------------------------------

describe('stripMarkdown', () => {
  it('removes heading markers', () => {
    expect(stripMarkdown('# Title\n## Subtitle')).not.toContain('#');
  });

  it('removes bold markers', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
  });

  it('removes italic markers', () => {
    expect(stripMarkdown('_italic_')).toBe('italic');
  });

  it('removes inline code backticks', () => {
    expect(stripMarkdown('`code here`')).toBe('code here');
  });

  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('preserves plain text', () => {
    expect(stripMarkdown('plain text')).toBe('plain text');
  });
});
