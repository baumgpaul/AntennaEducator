/**
 * FEM Studio PDF report: the model (parameters, geometry, materials,
 * conditions, mesh), a picture of the potential, the integral results and
 * the studies — in the same page layout as the antenna designer's report.
 */
import jsPDF from 'jspdf';
import type { PDFTableSection } from '@/utils/pdfDataBuilders';
import {
  COLOR_PRIMARY,
  COLOR_SECONDARY,
  CONTENT_W,
  MARGIN,
  PAGE_H,
  PAGE_W,
  drawFooter,
  drawHeading,
  drawTable,
  hexToRgb,
  setColor,
} from '@/utils/pdfLayout';
import type { SolveResult } from '../api';
import { TEMPLATES, type FemModel } from '../model';
import type { FieldImage } from './fieldImage';
import { modelTables, resultTables, studyTables } from './exports';

export interface FemReportOptions {
  model: FemModel;
  projectName: string;
  /** The solution, and whether it belongs to the model as it is now */
  result?: { data: SolveResult; current: boolean };
  fieldImage?: FieldImage | null;
}

/**
 * jsPDF's built-in fonts cover Latin-1 (WinAnsi) only: Greek letters and a
 * few math signs would print as garbage, so they are spelled out.
 */
const SPELLED: Record<string, string> = {
  ε: 'eps',
  Δ: 'Delta ',
  '∮': 'surface integral of',
  ᵀ: '^T',
  '√': 'sqrt',
  '∝': '~',
  '≈': '~',
  '→': '->',
  Ω: 'Ohm',
  π: 'pi',
  '−': '-',
  '…': '...',
};
export const pdfText = (s: string) => s.replace(/[εΔ∮ᵀ√∝≈→Ωπ−…]/g, (c) => SPELLED[c]);

const pdfSection = (t: PDFTableSection): PDFTableSection => ({
  title: pdfText(t.title),
  headers: t.headers.map(pdfText),
  rows: t.rows.map((r) => ({ cells: r.cells.map(pdfText) })),
});

/** The report as a jsPDF document (save it with doc.save). */
export function buildFemReport({ model, projectName, result, fieldImage }: FemReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - 25) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const subheading = (text: string) => {
    ensureSpace(24);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    setColor(doc, COLOR_SECONDARY);
    doc.text(pdfText(text), MARGIN, y);
    y += 3;
  };
  const table = (t: PDFTableSection) => {
    if (!t.rows.length) return;
    // keep a table on one page when it fits (title + header + rows)
    ensureSpace(Math.min(14 + 8 + 7 * t.rows.length, PAGE_H - 2 * MARGIN - 25));
    subheading(t.title);
    y = drawTable(doc, pdfSection(t), y) + 4;
  };
  const note = (text: string, color = '#757575') => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColor(doc, color);
    const lines = doc.splitTextToSize(pdfText(text), CONTENT_W) as string[];
    ensureSpace(5 * lines.length + 2);
    doc.text(lines, MARGIN, y);
    y += 5 * lines.length + 2;
  };

  // Title
  const [r, g, b] = hexToRgb(COLOR_PRIMARY);
  doc.setFillColor(r, g, b);
  doc.rect(0, y - 6, PAGE_W, 22, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(pdfText(projectName), MARGIN, y + 7);
  y += 24;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setColor(doc, COLOR_SECONDARY);
  doc.text('FEM Studio (preview) - 2D electrostatics, linear (P1) triangles', MARGIN, y);
  y += 5;
  doc.text(`Exported: ${new Date().toLocaleString()}`, MARGIN, y);
  y += 8;
  const template = TEMPLATES.find((t) => t.id === model.template);
  if (template) note(`Template "${template.title}": ${template.description}`);

  // Model
  y = drawHeading(doc, 'Model', y + 2);
  modelTables(model, result?.data).forEach(table);

  // Results
  ensureSpace(60);
  y = drawHeading(doc, 'Results', y + 2);
  if (!result) {
    note('Not solved yet.');
  } else {
    if (!result.current) note('These results belong to an earlier version of the model: solve again for current values.', '#B71C1C');
    if (fieldImage) {
      const imgH = Math.min(CONTENT_W / fieldImage.aspect, 110);
      const imgW = imgH * fieldImage.aspect;
      ensureSpace(imgH + 12);
      doc.addImage(fieldImage.dataUrl, fieldImage.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', MARGIN + (CONTENT_W - imgW) / 2, y, imgW, imgH);
      y += imgH + 4;
      note(`Potential V, colour scale viridis from ${fieldImage.min.toPrecision(4)} V (dark) to ${fieldImage.max.toPrecision(4)} V (yellow); domain boundaries in black.`);
    }
    resultTables(model, result.data).forEach(table);
  }

  // Studies
  const studies = studyTables(model);
  if (studies.length) {
    ensureSpace(40);
    y = drawHeading(doc, 'Studies', y + 2);
    studies.forEach(table);
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    drawFooter(doc, pdfText(projectName));
  }
  return doc;
}
