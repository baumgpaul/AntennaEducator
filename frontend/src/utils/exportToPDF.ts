/**
 * exportToPDF - Utility to export rendered view to PDF
 * Uses html2canvas to capture the view and jsPDF to generate the PDF
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { ViewConfiguration } from '@/types/postprocessing';

type Resolution = '1080p' | '1440p' | '4K';

interface ExportToPDFOptions {
  targetElement: HTMLElement;
  view: ViewConfiguration;
  metadata: {
    include: boolean;
    projectName?: string;
    frequency?: number; // Hz
    solverSettings?: Record<string, any>;
  };
  resolution: Resolution;
  filename: string;
}

const RESOLUTIONS: Record<Resolution, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4K': { width: 3840, height: 2160 },
};

/**
 * Export a view to PDF with optional metadata page
 * @param options Export configuration options
 * @throws Error if targetElement is not found or canvas capture fails
 */
export async function exportToPDF(options: ExportToPDFOptions): Promise<void> {
  const { targetElement, view, metadata, resolution, filename } = options;

  if (!targetElement) {
    throw new Error('Target element not found for export');
  }

  // Get resolution dimensions
  const { width, height } = RESOLUTIONS[resolution];

  try {
    // Capture the rendered view using html2canvas
    const canvas = await html2canvas(targetElement, {
      width,
      height,
      scale: 2, // High DPI for better quality
      backgroundColor: '#1a1a1a', // Match dark theme background
      useCORS: true, // Allow cross-origin images
      logging: false, // Disable debug logging
    });

    // Create PDF document (landscape A4)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Add metadata page if requested
    if (metadata.include) {
      pdf.setFontSize(20);
      pdf.text('Antenna Simulation Results', 20, 20);

      pdf.setFontSize(14);
      let yPos = 40;

      // View information
      pdf.setFont('helvetica', 'bold');
      pdf.text('View:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(view.name, 50, yPos);
      yPos += 10;

      pdf.setFont('helvetica', 'bold');
      pdf.text('Type:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(view.viewType === '3D' ? '3D Visualization' : 'Line Plot', 50, yPos);
      yPos += 10;

      // Project name
      if (metadata.projectName) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Project:', 20, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(metadata.projectName, 50, yPos);
        yPos += 10;
      }

      // Frequency
      if (metadata.frequency) {
        const frequencyMHz = (metadata.frequency / 1e6).toFixed(2);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Frequency:', 20, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${frequencyMHz} MHz`, 50, yPos);
        yPos += 10;
      }

      // Solver settings
      if (metadata.solverSettings && Object.keys(metadata.solverSettings).length > 0) {
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Solver Settings:', 20, yPos);
        yPos += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);

        for (const [key, value] of Object.entries(metadata.solverSettings)) {
          const formattedKey = key.replace(/([A-Z])/g, ' $1').trim();
          pdf.text(`  ${formattedKey}: ${value}`, 25, yPos);
          yPos += 6;
        }
      }

      // Export timestamp
      yPos += 10;
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Exported: ${new Date().toLocaleString()}`, 20, yPos);

      // Add new page for visualization
      pdf.addPage();
    }

    // Convert canvas to image data
    const imgData = canvas.toDataURL('image/png', 1.0);

    // Calculate dimensions to fit the page while maintaining aspect ratio
    const imgAspectRatio = width / height;
    const pdfAspectRatio = pdfWidth / pdfHeight;

    let imgWidth = pdfWidth;
    let imgHeight = pdfHeight;
    let xOffset = 0;
    let yOffset = 0;

    if (imgAspectRatio > pdfAspectRatio) {
      // Image is wider than PDF page
      imgHeight = pdfWidth / imgAspectRatio;
      yOffset = (pdfHeight - imgHeight) / 2;
    } else {
      // Image is taller than PDF page
      imgWidth = pdfHeight * imgAspectRatio;
      xOffset = (pdfWidth - imgWidth) / 2;
    }

    // Add the image to the PDF
    pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);

    // Save the PDF
    pdf.save(`${filename}.pdf`);

  } catch (error) {
    console.error('PDF export failed:', error);
    throw new Error(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
