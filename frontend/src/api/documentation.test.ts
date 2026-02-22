/**
 * Tests for Documentation API client.
 *
 * Run with: npm run test -- documentation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDocumentation,
  saveDocumentation,
  requestImageUpload,
  getImageUrl,
  deleteImage,
} from './documentation';

// Hoist-safe mocks
const hoisted = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('axios', () => ({}));

vi.mock('./client', () => ({
  getProjectsURL: () => 'http://localhost:8010',
  projectsClient: hoisted.mockClient,
  default: hoisted.mockClient,
}));

describe('Documentation API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getDocumentation ─────────────────────────────────────────────────────

  describe('getDocumentation', () => {
    it('should fetch documentation content', async () => {
      const mockData = { content: '# Hello', version: 2 };
      hoisted.mockClient.get.mockResolvedValue({ data: mockData });

      const result = await getDocumentation('proj-1');

      expect(hoisted.mockClient.get).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation'
      );
      expect(result).toEqual(mockData);
    });

    it('should return empty content for new projects', async () => {
      const mockData = { content: '', version: 1 };
      hoisted.mockClient.get.mockResolvedValue({ data: mockData });

      const result = await getDocumentation('proj-new');

      expect(result.content).toBe('');
      expect(result.version).toBe(1);
    });
  });

  // ── saveDocumentation ────────────────────────────────────────────────────

  describe('saveDocumentation', () => {
    it('should save documentation content', async () => {
      const mockResponse = { content: '# Updated', version: 3 };
      hoisted.mockClient.put.mockResolvedValue({ data: mockResponse });

      const result = await saveDocumentation('proj-1', '# Updated');

      expect(hoisted.mockClient.put).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation',
        { content: '# Updated' }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty content (clear docs)', async () => {
      const mockResponse = { content: '', version: 4 };
      hoisted.mockClient.put.mockResolvedValue({ data: mockResponse });

      const result = await saveDocumentation('proj-1', '');

      expect(hoisted.mockClient.put).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation',
        { content: '' }
      );
      expect(result.content).toBe('');
    });
  });

  // ── requestImageUpload ───────────────────────────────────────────────────

  describe('requestImageUpload', () => {
    it('should request presigned upload URL', async () => {
      const mockResponse = {
        upload_url: 'https://s3.example.com/presigned-put',
        image_key: 'img_abc123.png',
        s3_key: 'projects/proj-1/documentation/images/img_abc123.png',
        content_type: 'image/png',
      };
      hoisted.mockClient.post.mockResolvedValue({ data: mockResponse });

      const result = await requestImageUpload('proj-1', 'photo.png', 'image/png');

      expect(hoisted.mockClient.post).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation/images',
        { filename: 'photo.png', content_type: 'image/png' }
      );
      expect(result.upload_url).toBe('https://s3.example.com/presigned-put');
      expect(result.image_key).toBe('img_abc123.png');
    });

    it('should handle auto-detected content type', async () => {
      const mockResponse = {
        upload_url: 'https://s3.example.com/presigned-put',
        image_key: 'img_def456.jpeg',
        s3_key: 'projects/proj-1/documentation/images/img_def456.jpeg',
        content_type: 'image/jpeg',
      };
      hoisted.mockClient.post.mockResolvedValue({ data: mockResponse });

      const result = await requestImageUpload('proj-1', 'photo.jpg');

      expect(hoisted.mockClient.post).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation/images',
        { filename: 'photo.jpg', content_type: undefined }
      );
      expect(result.content_type).toBe('image/jpeg');
    });
  });

  // ── getImageUrl ──────────────────────────────────────────────────────────

  describe('getImageUrl', () => {
    it('should return presigned GET URL for image', async () => {
      hoisted.mockClient.get.mockResolvedValue({
        data: { url: 'https://s3.example.com/presigned-get?token=abc' },
      });

      const url = await getImageUrl('proj-1', 'img_abc123.png');

      expect(hoisted.mockClient.get).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation/images/img_abc123.png'
      );
      expect(url).toBe('https://s3.example.com/presigned-get?token=abc');
    });
  });

  // ── deleteImage ──────────────────────────────────────────────────────────

  describe('deleteImage', () => {
    it('should delete image by key', async () => {
      hoisted.mockClient.delete.mockResolvedValue({ data: null });

      await deleteImage('proj-1', 'img_abc123.png');

      expect(hoisted.mockClient.delete).toHaveBeenCalledWith(
        '/api/projects/proj-1/documentation/images/img_abc123.png'
      );
    });
  });
});
