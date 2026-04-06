/**
 * pdfReportGenerator — Async orchestrator for multi-page PDF report generation.
 *
 * Structure:
 *   Page 1:    Cover (project name, author, date, submission info)
 *   Page 2:    Antenna Design Summary (elements table + variable definitions)
 *   Page 3:    Solver Configuration (frequency, Z0, method)
 *   Pages 4+:  Result Views (one page per PostprocessingTab view)
 *   Final:     Documentation (markdown content as plain text)
 *
 * The caller provides:
 *  - Structured data (from Redux state) for text sections
 *  - A `captureView(viewId)` callback that returns a PNG data URL for each view
 *
 * External dependencies: jspdf, html2canvas (already in package.json)
 */

import jsPDF from 'jspdf';
import type { AntennaElement } from '@/types/models';
import type { VariableDefinition } from '@/utils/expressionEvaluator';
import type { ViewConfiguration } from '@/types/postprocessing';
import {
  buildAntennaSummaryRows,
  buildVariableRows,
  buildSolverConfigRows,
  buildCoverPageData,
  stripMarkdown,
  type PDFTableSection,
  type SubmissionMeta,
} from './pdfDataBuilders';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PDFSections {
  cover: boolean;
  antennaSummary: boolean;
  solverConfig: boolean;
  /** Capture of the first 3D view — shows antenna geometry, feeds, and field definitions. */
  antennaGeometry?: boolean;
  views: boolean;
  documentation: boolean;
}

export interface PDFReportOptions {
  projectName: string;
  authorName?: string;
  elements: AntennaElement[];
  variables: VariableDefinition[];
  viewConfigurations: ViewConfiguration[];
  solverConfig: {
    frequency?: number;
    z0?: number;
    numFrequencies?: number;
    sweepStart?: number;
    sweepEnd?: number;
    method?: string;
  } | null;
  documentationContent: string;
  submissionMeta?: SubmissionMeta;
  sections: PDFSections;
  /** Async callback: switch to viewId, wait for render, capture → data URL. */
  captureView: (viewId: string) => Promise<string>;
  /** Async callback: capture the first 3D view for the Antenna Geometry section.
   *  Returns null when no 3D view exists (section renders a placeholder). */
  captureAntennaGeometry?: () => Promise<string | null>;
  filename: string;
  onProgress?: (message: string, current: number, total: number) => void;
}

// ---------------------------------------------------------------------------
// Layout constants (A4 portrait in mm)
// ---------------------------------------------------------------------------

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Colour palette
const COLOR_PRIMARY = '#1565C0';   // MUI blue 800
const COLOR_SECONDARY = '#424242'; // dark grey
const COLOR_LIGHT = '#F5F5F5';     // table header fill

// ---------------------------------------------------------------------------
// Step count helper (exposed for testing)
// ---------------------------------------------------------------------------

export function buildTotalSteps(opts: PDFReportOptions): number {
  let steps = 0;
  if (opts.sections.cover) steps++;
  if (opts.sections.antennaSummary) steps++;
  if (opts.sections.solverConfig) steps++;
  if (opts.sections.antennaGeometry) steps++;
  if (opts.sections.views) steps += opts.viewConfigurations.length;
  if (opts.sections.documentation && opts.documentationContent) steps++;
  return steps;
}

// ---------------------------------------------------------------------------
// Internal layout helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawHLine(doc: jsPDF, y: number, lw = 0.3, color = '#BDBDBD') {
  const [r, g, b] = hexToRgb(color);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(lw);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

function drawFooter(doc: jsPDF, projectName: string) {
  const y = PAGE_H - 10;
  doc.setFontSize(8);
  setColor(doc, '#9E9E9E');
  doc.setFont('helvetica', 'normal');
  doc.text('Antenna Educator — ' + projectName, MARGIN, y);
  doc.text(`Exported: ${new Date().toLocaleString()}`, PAGE_W - MARGIN, y, { align: 'right' });
}

/**
 * Render a two-column key-value table.
 * Returns the Y position after the table.
 */
function drawTable(doc: jsPDF, section: PDFTableSection, startY: number): number {
  const { headers, rows } = section;
  const isKeyValue = headers.length === 2;
  const colWidths = isKeyValue
    ? [60, CONTENT_W - 60]
    : distributeColumns(headers.length);

  let y = startY;
  const rowH = 7;
  const headerH = 8;

  // Header row
  const [hr, hg, hb] = hexToRgb(COLOR_LIGHT);
  doc.setFillColor(hr, hg, hb);
  doc.rect(MARGIN, y, CONTENT_W, headerH, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setColor(doc, COLOR_SECONDARY);
  let cx = MARGIN + 2;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx, y + 5.5);
    cx += colWidths[i];
  }
  y += headerH;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (let ri = 0; ri < rows.length; ri++) {
    if (ri % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    }
    drawHLine(doc, y, 0.1, '#E0E0E0');
    cx = MARGIN + 2;
    for (let ci = 0; ci < rows[ri].cells.length; ci++) {
      const cellText = rows[ri].cells[ci] ?? '';
      const maxW = colWidths[ci] - 4;
      // Truncate long strings to fit the cell
      const truncated = doc.getStringUnitWidth(cellText) * 8.5 > maxW * 2.835
        ? cellText.slice(0, Math.floor(maxW * 0.6)) + '…'
        : cellText;
      setColor(doc, '#212121');
      doc.text(truncated, cx, y + 5);
      cx += colWidths[ci];
    }
    y += rowH;

    // Page break: leave room for footer
    if (y > PAGE_H - 25) {
      doc.addPage();
      y = MARGIN;
    }
  }

  return y + 3;
}

/** Distribute column widths evenly. */
function distributeColumns(n: number): number[] {
  const w = Math.floor(CONTENT_W / n);
  return Array(n).fill(w);
}

/** Draw a section heading (blue, bold). Returns Y after heading. */
function drawHeading(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setColor(doc, COLOR_PRIMARY);
  doc.text(title, MARGIN, y);
  const lineY = y + 2;
  drawHLine(doc, lineY, 0.5, COLOR_PRIMARY);
  return lineY + 6;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderCover(doc: jsPDF, opts: PDFReportOptions) {
  const data = buildCoverPageData({
    projectName: opts.projectName,
    authorName: opts.authorName,
    courseName: opts.submissionMeta
      ? undefined
      : undefined, // extend later if course name passed
    submission: opts.submissionMeta,
  });

  let y = 50;

  // Title bar background
  const [r, g, b] = hexToRgb(COLOR_PRIMARY);
  doc.setFillColor(r, g, b);
  doc.rect(0, y - 10, PAGE_W, 30, 'F');

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const title = doc.splitTextToSize(data.projectName, CONTENT_W);
  doc.text(title as string[], MARGIN, y + 8);
  y += 35;

  doc.setTextColor(0, 0, 0);

  if (data.authorName) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    setColor(doc, COLOR_SECONDARY);
    doc.text(`Author: ${data.authorName}`, MARGIN, y);
    y += 8;
  }

  doc.setFontSize(10);
  setColor(doc, COLOR_SECONDARY);
  doc.text(`Exported: ${data.exportDate}`, MARGIN, y);
  y += 6;

  // Submission box
  if (data.submission) {
    y += 6;
    const [fr, fg, fb] = hexToRgb('#FFF3E0'); // orange tint
    doc.setFillColor(fr, fg, fb);
    const boxH = data.submission.feedback ? 44 : 32;
    doc.rect(MARGIN - 2, y - 4, CONTENT_W + 4, boxH, 'F');
    drawHLine(doc, y - 4, 0.4, '#FF9800');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    setColor(doc, '#E65100');
    doc.text('SUBMISSION', MARGIN, y + 4);
    y += 10;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    setColor(doc, '#212121');
    doc.text(`Student: ${data.submission.studentName}`, MARGIN, y);
    y += 6;
    doc.text(`Submitted: ${new Date(data.submission.submittedAt).toLocaleString()}`, MARGIN, y);
    y += 6;
    doc.text(`Status: ${data.submission.status.toUpperCase()}`, MARGIN, y);
    y += 6;

    if (data.submission.feedback) {
      doc.setFont('helvetica', 'italic');
      setColor(doc, '#5D4037');
      const feedbackLines = doc.splitTextToSize(`Feedback: ${data.submission.feedback}`, CONTENT_W);
      doc.text(feedbackLines as string[], MARGIN, y);
    }
  }

  // "Antenna Educator" branding at the bottom of cover
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  setColor(doc, '#9E9E9E');
  doc.text('Generated by Antenna Educator', MARGIN, PAGE_H - 20);
}

function renderAntennaSummary(doc: jsPDF, opts: PDFReportOptions) {
  let y = MARGIN;
  y = drawHeading(doc, 'Antenna Design Summary', y);

  const summary = buildAntennaSummaryRows(opts.elements);
  if (summary.rows.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#757575');
    doc.text('No antenna elements defined.', MARGIN, y);
    y += 10;
  } else {
    y = drawTable(doc, summary, y);
  }

  if (opts.variables.length > 0) {
    y += 4;
    y = drawHeading(doc, 'Variable Definitions', y);
    const varSection = buildVariableRows(opts.variables);
    y = drawTable(doc, varSection, y);
  }

  drawFooter(doc, opts.projectName);
}

function renderSolverConfig(doc: jsPDF, opts: PDFReportOptions) {
  let y = MARGIN;
  y = drawHeading(doc, 'Solver Configuration', y);

  const section = buildSolverConfigRows(opts.solverConfig);
  if (section.rows.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#757575');
    doc.text('No solver configuration available.', MARGIN, y);
  } else {
    drawTable(doc, section, y);
  }

  drawFooter(doc, opts.projectName);
}

async function renderView(
  doc: jsPDF,
  view: ViewConfiguration,
  captureView: (id: string) => Promise<string>,
  projectName: string,
) {
  let y = MARGIN;
  y = drawHeading(doc, `View: ${view.name}`, y);

  // Type label
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, COLOR_SECONDARY);
  doc.text(`Type: ${view.viewType}`, MARGIN, y);
  y += 8;

  // Capture the rendered view
  let dataUrl: string;
  try {
    dataUrl = await captureView(view.id);
  } catch {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#B71C1C');
    doc.text(`[View "${view.name}" could not be captured]`, MARGIN, y);
    drawFooter(doc, projectName);
    return;
  }

  // Guard against empty / invalid captures (e.g. WebGL context not ready)
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#B71C1C');
    doc.text(`[View "${view.name}" could not be captured — no image data]`, MARGIN, y);
    drawFooter(doc, projectName);
    return;
  }

  // Fit image to page width while preserving aspect ratio
  const maxW = CONTENT_W;
  const maxH = PAGE_H - MARGIN * 2 - y - 10;

  // We don't know the original aspect ratio from the data URL;
  // use a 16:9 default (will be correct for landscape captures)
  const imgW = maxW;
  const imgH = Math.min(maxH, imgW * (9 / 16));

  // Detect format from data URL prefix to avoid PNG decoder errors on non-PNG captures
  const imgFormat = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
  doc.addImage(dataUrl, imgFormat, MARGIN, y, imgW, imgH);

  drawFooter(doc, projectName);
}

function renderDocumentation(doc: jsPDF, opts: PDFReportOptions) {
  let y = MARGIN;
  y = drawHeading(doc, 'Documentation', y);

  if (!opts.documentationContent) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#757575');
    doc.text('No documentation content.', MARGIN, y);
    drawFooter(doc, opts.projectName);
    return;
  }

  const plainText = stripMarkdown(opts.documentationContent);
  const lines = doc.splitTextToSize(plainText, CONTENT_W);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  setColor(doc, '#212121');

  for (const line of lines as string[]) {
    doc.text(line, MARGIN, y);
    y += 5.5;
    if (y > PAGE_H - 20) {
      drawFooter(doc, opts.projectName);
      doc.addPage();
      y = MARGIN;
    }
  }

  drawFooter(doc, opts.projectName);
}

async function renderAntennaGeometry(
  doc: jsPDF,
  captureAntennaGeometry: (() => Promise<string | null>) | undefined,
  projectName: string,
) {
  let y = MARGIN;
  y = drawHeading(doc, 'Antenna Geometry', y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, COLOR_SECONDARY);
  doc.text('3D view — wire mesh, feed structure, and requested fields', MARGIN, y);
  y += 8;

  let dataUrl: string | null = null;
  if (captureAntennaGeometry) {
    try {
      dataUrl = await captureAntennaGeometry();
    } catch {
      dataUrl = null;
    }
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, '#757575');
    doc.text('No 3D view available — add a 3D view in the PostprocessingTab to include a geometry capture here.', MARGIN, y);
    drawFooter(doc, projectName);
    return;
  }

  const maxW = CONTENT_W;
  const maxH = PAGE_H - MARGIN * 2 - y - 10;
  const imgW = maxW;
  const imgH = Math.min(maxH, imgW * (9 / 16));
  const imgFormat = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
  doc.addImage(dataUrl, imgFormat, MARGIN, y, imgW, imgH);
  drawFooter(doc, projectName);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a structured multi-page PDF report and trigger browser download.
 */
export async function generatePDFReport(opts: PDFReportOptions): Promise<void> {
  const total = buildTotalSteps(opts);
  let current = 0;

  const progress = (message: string) => {
    current++;
    opts.onProgress?.(message, current, total);
  };

  // Create document in portrait A4
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let firstPage = true;

  const nextPage = () => {
    if (!firstPage) doc.addPage();
    firstPage = false;
  };

  // --- Cover ---
  if (opts.sections.cover) {
    nextPage();
    renderCover(doc, opts);
    progress('Cover page');
  }

  // --- Antenna Summary ---
  if (opts.sections.antennaSummary) {
    nextPage();
    renderAntennaSummary(doc, opts);
    progress('Antenna summary');
  }

  // --- Solver Config ---
  if (opts.sections.solverConfig) {
    nextPage();
    renderSolverConfig(doc, opts);
    progress('Solver configuration');
  }

  // --- Antenna Geometry ---
  if (opts.sections.antennaGeometry) {
    nextPage();
    await renderAntennaGeometry(doc, opts.captureAntennaGeometry, opts.projectName);
    progress('Antenna geometry');
  }

  // --- Views ---
  if (opts.sections.views) {
    for (const view of opts.viewConfigurations) {
      nextPage();
      await renderView(doc, view, opts.captureView, opts.projectName);
      progress(`View: ${view.name}`);
    }
  }

  // --- Documentation ---
  if (opts.sections.documentation && opts.documentationContent) {
    nextPage();
    renderDocumentation(doc, opts);
    progress('Documentation');
  }

  // Save
  const finalFilename = opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`;
  doc.save(finalFilename);
}
