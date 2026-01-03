import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToPDF } from './exportToPDF';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Mock dependencies
vi.mock('html2canvas');
vi.mock('jspdf');

describe('exportToPDF', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockPDF: any;
  let mockTargetElement: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock canvas
    mockCanvas = document.createElement('canvas');
    mockCanvas.width = 1920;
    mockCanvas.height = 1080;
    mockCanvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
    
    // Mock html2canvas
    (html2canvas as any).mockResolvedValue(mockCanvas);
    
    // Mock jsPDF
    mockPDF = {
      addPage: vi.fn(),
      text: vi.fn(),
      addImage: vi.fn(),
      save: vi.fn(),
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    };
    (jsPDF as any).mockImplementation(() => mockPDF);
    
    // Create mock target element
    mockTargetElement = document.createElement('div');
  });

  it('captures element with html2canvas at correct resolution', async () => {
    await exportToPDF({
      targetElement: mockTargetElement,
      view: { id: 'v1', name: 'Test View', viewType: '3D', items: [] },
      metadata: { include: false },
      resolution: '1080p',
      filename: 'test',
    });

    expect(html2canvas).toHaveBeenCalledWith(mockTargetElement, expect.objectContaining({
      width: 1920,
      height: 1080,
      scale: 2,
      backgroundColor: '#1a1a1a',
    }));
  });

  it('creates PDF without metadata when not included', async () => {
    await exportToPDF({
      targetElement: mockTargetElement,
      view: { id: 'v1', name: 'Test View', viewType: '3D', items: [] },
      metadata: { include: false },
      resolution: '1080p',
      filename: 'test',
    });

    expect(mockPDF.addPage).not.toHaveBeenCalled();
    expect(mockPDF.addImage).toHaveBeenCalledTimes(1);
    expect(mockPDF.save).toHaveBeenCalledWith('test.pdf');
  });

  it('creates PDF with metadata page when included', async () => {
    await exportToPDF({
      targetElement: mockTargetElement,
      view: { id: 'v1', name: 'Test View', viewType: '3D', items: [] },
      metadata: {
        include: true,
        projectName: 'My Project',
        frequency: 300e6,
      },
      resolution: '1080p',
      filename: 'test',
    });

    expect(mockPDF.text).toHaveBeenCalled();
    expect(mockPDF.addPage).toHaveBeenCalled();
    expect(mockPDF.addImage).toHaveBeenCalledTimes(1);
    expect(mockPDF.save).toHaveBeenCalledWith('test.pdf');
  });

  it('handles different resolutions correctly', async () => {
    await exportToPDF({
      targetElement: mockTargetElement,
      view: { id: 'v1', name: 'Test View', viewType: '3D', items: [] },
      metadata: { include: false },
      resolution: '4K',
      filename: 'test',
    });

    expect(html2canvas).toHaveBeenCalledWith(mockTargetElement, expect.objectContaining({
      width: 3840,
      height: 2160,
    }));
  });
});
