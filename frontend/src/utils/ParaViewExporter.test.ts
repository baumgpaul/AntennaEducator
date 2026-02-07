import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToVTU, canExportToVTU } from './ParaViewExporter';
import { postprocessorClient } from '@/api/client';
import type { RootState } from '@/store';

// Mock API client
vi.mock('@/api/client', () => ({
  postprocessorClient: {
    post: vi.fn(),
  },
}));

describe('ParaViewExporter', () => {
  let mockState: RootState;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockState = {
      solver: {
        fieldData: {
          'field1': {
            300000000: {
              observation_points: [[0, 0, 0], [1, 0, 0]],
              E_field: [[1, 0, 0], [0, 1, 0]],
              H_field: [[0, 0, 1], [1, 0, 1]],
            },
          },
        },
      },
    } as any;
  });

  describe('canExportToVTU', () => {
    it('returns true when field data exists', () => {
      const result = canExportToVTU('field1', 300000000, mockState);
      expect(result).toBe(true);
    });

    it('returns false when field data does not exist', () => {
      const result = canExportToVTU('field2', 300000000, mockState);
      expect(result).toBe(false);
    });

    it('returns false when frequency data does not exist', () => {
      const result = canExportToVTU('field1', 400000000, mockState);
      expect(result).toBe(false);
    });
  });

  describe('exportToVTU', () => {
    it('calls API with correct payload', async () => {
      const mockBlob = new Blob(['mock vtu content'], { type: 'application/xml' });
      const mockResponse = { data: mockBlob };
      (postprocessorClient.post as any).mockResolvedValue(mockResponse);

      // Mock URL.createObjectURL and document.createElement
      global.URL.createObjectURL = vi.fn(() => 'mock-url');
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      await exportToVTU({
        fieldId: 'field1',
        frequencyHz: 300000000,
        filename: 'test_export',
      }, mockState);

      expect(postprocessorClient.post).toHaveBeenCalledWith(
        '/api/export/vtu',
        expect.objectContaining({
          observation_points: [[0, 0, 0], [1, 0, 0]],
          E_field: [[1, 0, 0], [0, 1, 0]],
          H_field: [[0, 0, 1], [1, 0, 1]],
        }),
        expect.objectContaining({
          responseType: 'blob',
        })
      );
    });

    it('triggers download with correct filename', async () => {
      const mockBlob = new Blob(['mock vtu content'], { type: 'application/xml' });
      const mockResponse = { data: mockBlob };
      (postprocessorClient.post as any).mockResolvedValue(mockResponse);

      global.URL.createObjectURL = vi.fn(() => 'mock-url');
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      await exportToVTU({
        fieldId: 'field1',
        frequencyHz: 300000000,
        filename: 'test_export',
      }, mockState);

      expect(mockLink.download).toBe('test_export.vtu');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('throws error when field data is missing', async () => {
      await expect(
        exportToVTU({
          fieldId: 'field2',
          frequencyHz: 300000000,
          filename: 'test',
        }, mockState)
      ).rejects.toThrow('Field data not found');
    });
  });
});
