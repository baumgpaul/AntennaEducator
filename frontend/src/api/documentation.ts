/**
 * Documentation API — S3-backed markdown content + image management.
 *
 * Endpoints:
 *   GET    /api/projects/{pid}/documentation
 *   PUT    /api/projects/{pid}/documentation
 *   POST   /api/projects/{pid}/documentation/images
 *   GET    /api/projects/{pid}/documentation/images/{key}
 *   DELETE /api/projects/{pid}/documentation/images/{key}
 */

import { projectsClient } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocumentationContent {
  content: string;
  version: number;
}

export interface ImageUploadRequest {
  filename: string;
  content_type?: string;
}

export interface ImageUploadResponse {
  upload_url: string;
  image_key: string;
  s3_key: string;
  content_type: string;
}

export interface ImageUrlResponse {
  url: string;
}

// ── API Functions ────────────────────────────────────────────────────────────

/**
 * Load documentation content from S3.
 * Returns empty content if no documentation exists.
 */
export async function getDocumentation(
  projectId: string
): Promise<DocumentationContent> {
  const response = await projectsClient.get<DocumentationContent>(
    `/api/projects/${projectId}/documentation`
  );
  return response.data;
}

/**
 * Save documentation content to S3.
 * Also updates documentation metadata in DynamoDB.
 */
export async function saveDocumentation(
  projectId: string,
  content: string
): Promise<DocumentationContent> {
  const response = await projectsClient.put<DocumentationContent>(
    `/api/projects/${projectId}/documentation`,
    { content }
  );
  return response.data;
}

/**
 * Request a presigned PUT URL for direct image upload to S3.
 * The frontend then uploads the image binary directly to S3
 * using the returned URL (bypasses Lambda 6MB payload limit).
 */
export async function requestImageUpload(
  projectId: string,
  filename: string,
  contentType?: string
): Promise<ImageUploadResponse> {
  const response = await projectsClient.post<ImageUploadResponse>(
    `/api/projects/${projectId}/documentation/images`,
    { filename, content_type: contentType }
  );
  return response.data;
}

/**
 * Upload an image file directly to S3 using a presigned URL.
 *
 * @param uploadUrl - Presigned PUT URL from requestImageUpload()
 * @param file - The image File or Blob to upload
 * @param contentType - MIME type of the image
 */
export async function uploadImageToS3(
  uploadUrl: string,
  file: File | Blob,
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': contentType,
    },
  });
  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Get a presigned GET URL for an image.
 * Can be used as an <img> src attribute.
 */
export async function getImageUrl(
  projectId: string,
  imageKey: string
): Promise<string> {
  const response = await projectsClient.get<ImageUrlResponse>(
    `/api/projects/${projectId}/documentation/images/${imageKey}`
  );
  return response.data.url;
}

/**
 * Delete a documentation image from S3.
 */
export async function deleteImage(
  projectId: string,
  imageKey: string
): Promise<void> {
  await projectsClient.delete(
    `/api/projects/${projectId}/documentation/images/${imageKey}`
  );
}
