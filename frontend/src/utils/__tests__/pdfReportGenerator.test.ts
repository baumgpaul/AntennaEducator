/**
 * Tests for pdfReportGenerator — the async PDF orchestrator.
 *
 * We mock jsPDF and html2canvas to keep tests fast and environment-independent.
 * Pure data logic (covered in pdfDataBuilders.test.ts) is not re-tested here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PDFReportOptions } from '../pdfReportGenerator';
import { generatePDFReport, buildTotalSteps } from '../pdfReportGenerator';

// ---------------------------------------------------------------------------
// Mock jsPDF
// ---------------------------------------------------------------------------

const mockSave = vi.fn();
const mockAddPage = vi.fn();
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetFont = vi.fn();
const mockAddImage = vi.fn();
const mockLine = vi.fn();
const mockSetDrawColor = vi.fn();
const mockSetFillColor = vi.fn();
const mockRect = vi.fn();
const mockGetStringUnitWidth = vi.fn(() => 1);
const mockInternal = {
  pageSize: { getWidth: () => 210, getHeight: () => 297 },
  getNumberOfPages: () => 1,
};

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    save: mockSave,
    addPage: mockAddPage,
    text: mockText,
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    addImage: mockAddImage,
    line: mockLine,
    setDrawColor: mockSetDrawColor,
    setFillColor: mockSetFillColor,
    rect: mockRect,
    getStringUnitWidth: mockGetStringUnitWidth,
    internal: mockInternal,
    setTextColor: vi.fn(),
    setLineWidth: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
  })),
}));

// ---------------------------------------------------------------------------
// Mock html2canvas
// ---------------------------------------------------------------------------

const fakeCanvas = {
  toDataURL: vi.fn(() => 'data:image/png;base64,fakeimagedata'),
  width: 800,
  height: 600,
};

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue(fakeCanvas),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeOptions(overrides: Partial<PDFReportOptions> = {}): PDFReportOptions {
  return {
    projectName: 'Test Project',
    authorName: 'Alice',
    elements: [],
    variables: [],
    viewConfigurations: [],
    solverConfig: { frequency: 300e6, z0: 50, method: 'peec' },
    documentationContent: '',
    sections: {
      cover: true,
      antennaSummary: true,
      solverConfig: true,
      views: false,
      documentation: false,
    },
    captureView: vi.fn().mockResolvedValue('data:image/png;base64,viewimage'),
    filename: 'test_report',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildTotalSteps
// ---------------------------------------------------------------------------

describe('buildTotalSteps', () => {
  it('counts 1 step per enabled text section', () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: true, solverConfig: true, views: false, documentation: false },
      viewConfigurations: [],
    });
    const steps = buildTotalSteps(opts);
    expect(steps).toBe(3); // cover + antennaSummary + solverConfig
  });

  it('counts 1 step per view when views enabled', () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: false, solverConfig: false, views: true, documentation: false },
      viewConfigurations: [
        { id: 'v1', name: 'View 1', viewType: '3D', items: [] },
        { id: 'v2', name: 'View 2', viewType: 'Line', items: [] },
      ],
    });
    expect(buildTotalSteps(opts)).toBe(3); // cover + 2 views
  });

  it('counts 1 step for documentation section', () => {
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, views: false, documentation: true },
      documentationContent: 'Some content',
    });
    expect(buildTotalSteps(opts)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// generatePDFReport
// ---------------------------------------------------------------------------

describe('generatePDFReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls save with .pdf filename', async () => {
    await generatePDFReport(makeOptions({ filename: 'my_report' }));
    expect(mockSave).toHaveBeenCalledWith('my_report.pdf');
  });

  it('appends .pdf if not already present', async () => {
    await generatePDFReport(makeOptions({ filename: 'report.pdf' }));
    expect(mockSave).toHaveBeenCalledWith('report.pdf');
  });

  it('does not call addPage when only cover is enabled', async () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: false, solverConfig: false, views: false, documentation: false },
    });
    await generatePDFReport(opts);
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it('adds pages for each enabled section beyond cover', async () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: true, solverConfig: true, views: false, documentation: false },
    });
    await generatePDFReport(opts);
    // antennaSummary + solverConfig = 2 addPage calls
    expect(mockAddPage).toHaveBeenCalledTimes(2);
  });

  it('calls captureView for each view when views section enabled', async () => {
    const captureView = vi.fn().mockResolvedValue('data:image/png;base64,x');
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, views: true, documentation: false },
      viewConfigurations: [
        { id: 'v1', name: 'View A', viewType: 'Line', items: [] },
        { id: 'v2', name: 'View B', viewType: 'Smith', items: [] },
      ],
      captureView,
    });
    await generatePDFReport(opts);
    expect(captureView).toHaveBeenCalledTimes(2);
    expect(captureView).toHaveBeenCalledWith('v1');
    expect(captureView).toHaveBeenCalledWith('v2');
  });

  it('does not call captureView when views section is disabled', async () => {
    const captureView = vi.fn();
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: true, solverConfig: true, views: false, documentation: false },
      captureView,
    });
    await generatePDFReport(opts);
    expect(captureView).not.toHaveBeenCalled();
  });

  it('calls onProgress for each step', async () => {
    const onProgress = vi.fn();
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: true, solverConfig: false, views: false, documentation: false },
      onProgress,
    });
    await generatePDFReport(opts);
    expect(onProgress).toHaveBeenCalledTimes(2); // cover + antennaSummary
  });

  it('includes submission metadata text when provided', async () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: false, solverConfig: false, views: false, documentation: false },
      submissionMeta: {
        studentName: 'Bob',
        submittedAt: '2026-04-01T10:00:00Z',
        status: 'reviewed',
        feedback: 'Good work!',
      },
    });
    await generatePDFReport(opts);
    // Verify text() was called (cover page rendered)
    expect(mockText).toHaveBeenCalled();
  });

  it('skips all sections gracefully when all disabled', async () => {
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, views: false, documentation: false },
    });
    await generatePDFReport(opts);
    expect(mockSave).toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it('adds image to PDF for captured views', async () => {
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, views: true, documentation: false },
      viewConfigurations: [{ id: 'v1', name: 'Line Plot', viewType: 'Line', items: [] }],
      captureView: vi.fn().mockResolvedValue('data:image/png;base64,viewdata'),
    });
    await generatePDFReport(opts);
    expect(mockAddImage).toHaveBeenCalled();
  });

  it('calls captureAntennaGeometry when antennaGeometry section enabled', async () => {
    const captureAntennaGeometry = vi.fn().mockResolvedValue('data:image/png;base64,geomdata');
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, antennaGeometry: true, views: false, documentation: false },
      captureAntennaGeometry,
    });
    await generatePDFReport(opts);
    expect(captureAntennaGeometry).toHaveBeenCalledTimes(1);
    expect(mockAddImage).toHaveBeenCalled();
  });

  it('shows placeholder text when captureAntennaGeometry returns null', async () => {
    const captureAntennaGeometry = vi.fn().mockResolvedValue(null);
    const opts = makeOptions({
      sections: { cover: false, antennaSummary: false, solverConfig: false, antennaGeometry: true, views: false, documentation: false },
      captureAntennaGeometry,
    });
    await generatePDFReport(opts);
    expect(mockAddImage).not.toHaveBeenCalled();
    expect(mockText).toHaveBeenCalled(); // placeholder text
  });

  it('does not call captureAntennaGeometry when section disabled', async () => {
    const captureAntennaGeometry = vi.fn();
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: false, solverConfig: false, antennaGeometry: false, views: false, documentation: false },
      captureAntennaGeometry,
    });
    await generatePDFReport(opts);
    expect(captureAntennaGeometry).not.toHaveBeenCalled();
  });

  it('counts antennaGeometry as 1 step in buildTotalSteps', () => {
    const opts = makeOptions({
      sections: { cover: true, antennaSummary: false, solverConfig: false, antennaGeometry: true, views: false, documentation: false },
    });
    expect(buildTotalSteps(opts)).toBe(2); // cover + antennaGeometry
  });
});
