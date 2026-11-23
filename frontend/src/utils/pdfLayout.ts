/**
 * PDF page layout shared by the reports of both workflows:
 * A4 portrait in mm, headings, tables with wrapping and page breaks, footer.
 */

import type jsPDF from 'jspdf';
import type { PDFTableSection } from './pdfDataBuilders';

// ---------------------------------------------------------------------------
// Layout constants (A4 portrait in mm)
// ---------------------------------------------------------------------------

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 18;
export const CONTENT_W = PAGE_W - MARGIN * 2;

// Colour palette
export const COLOR_PRIMARY = '#1565C0';   // MUI blue 800
export const COLOR_SECONDARY = '#424242'; // dark grey
export const COLOR_LIGHT = '#F5F5F5';     // table header fill

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

export function drawHLine(doc: jsPDF, y: number, lw = 0.3, color = '#BDBDBD') {
  const [r, g, b] = hexToRgb(color);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(lw);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

export function drawFooter(doc: jsPDF, projectName: string) {
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
export function drawTable(doc: jsPDF, section: PDFTableSection, startY: number): number {
  const { headers, rows } = section;
  const isKeyValue = headers.length === 2;
  const colWidths = isKeyValue
    ? [60, CONTENT_W - 60]
    : smartColumnWidths(headers);

  let y = startY;
  const baseRowH = 7;
  const headerH = 8;
  const fontSize = 8.5;

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

  // Data rows — word-wrap cells that exceed column width
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  for (let ri = 0; ri < rows.length; ri++) {
    // Pre-compute wrapped lines per cell to determine row height
    const wrappedCells: string[][] = rows[ri].cells.map((cell, ci) => {
      const cellText = cell ?? '';
      const maxW = colWidths[ci] - 4;
      return doc.splitTextToSize(cellText, maxW) as string[];
    });
    const lineCount = Math.max(1, ...wrappedCells.map(lines => lines.length));
    const rowH = baseRowH + (lineCount - 1) * 4;

    if (ri % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    }
    drawHLine(doc, y, 0.1, '#E0E0E0');
    cx = MARGIN + 2;
    for (let ci = 0; ci < wrappedCells.length; ci++) {
      setColor(doc, '#212121');
      for (let li = 0; li < wrappedCells[ci].length; li++) {
        doc.text(wrappedCells[ci][li], cx, y + 5 + li * 4);
      }
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

/**
 * Smart column widths based on header names.
 * Known headers get fixed widths; remainder goes to the widest column.
 */
export function smartColumnWidths(headers: string[]): number[] {
  // Known narrow columns
  const NARROW: Record<string, number> = {
    '#': 10,
    'Nodes': 18,
    'Edges': 18,
  };
  const MEDIUM: Record<string, number> = {
    'Name': 30,
    'Type': 24,
  };

  const known = { ...NARROW, ...MEDIUM };
  let usedWidth = 0;
  let flexCount = 0;

  for (const h of headers) {
    if (known[h]) {
      usedWidth += known[h];
    } else {
      flexCount++;
    }
  }

  // Give remaining space to flex columns (like "Key Parameters")
  const flexWidth = flexCount > 0
    ? Math.floor((CONTENT_W - usedWidth) / flexCount)
    : 0;

  return headers.map(h => known[h] ?? flexWidth);
}

/** Draw a section heading (blue, bold). Returns Y after heading. */
export function drawHeading(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setColor(doc, COLOR_PRIMARY);
  doc.text(title, MARGIN, y);
  const lineY = y + 2;
  drawHLine(doc, lineY, 0.5, COLOR_PRIMARY);
  return lineY + 6;
}
