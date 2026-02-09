/**
 * ParaViewExporter - Utility to export field data to VTU format for ParaView
 * Calls backend API to generate VTU file and triggers browser download
 */

import { postprocessorClient } from '@/api/client';
import type { RootState } from '@/store';

interface ExportToVTUOptions {
  fieldId: string;
  frequencyHz: number;
  filename: string;
}

/**
 * Export field data to VTU format for ParaView visualization
 * @param options Export configuration with field ID, frequency, and filename
 * @param state Redux state to access field data
 * @throws Error if field data is not found or API call fails
 */
export async function exportToVTU(
  options: ExportToVTUOptions,
  state: RootState
): Promise<void> {
  const { fieldId, frequencyHz, filename } = options;

  // Get field data from Redux
  const fieldData = state.solver.fieldData?.[fieldId]?.[frequencyHz];

  if (!fieldData) {
    throw new Error(
      `No field data available for export (Field: ${fieldId}, Frequency: ${(frequencyHz / 1e6).toFixed(2)} MHz)`
    );
  }

  if (!fieldData.points || fieldData.points.length === 0) {
    throw new Error('Field data has no observation points');
  }

  // Get geometry data from solver state
  const elements = state.design.elements;

  if (!elements || elements.length === 0) {
    throw new Error('No antenna elements found');
  }

  // Extract nodes and edges from first element's mesh (simplified for MVP)
  // In production, this should merge all elements' meshes
  const firstMesh = elements[0]?.mesh;

  if (!firstMesh || !firstMesh.nodes || !firstMesh.edges) {
    throw new Error('Mesh data not available');
  }

  // Prepare request payload for backend
  const requestPayload = {
    frequencies: [frequencyHz],
    observation_points: fieldData.points,
    nodes: firstMesh.nodes,
    edges: firstMesh.edges,
    radii: firstMesh.radii || Array(firstMesh.edges.length).fill(0.001), // Default 1mm radius
    branch_currents: [Array(firstMesh.edges.length).fill('0+0j')], // Placeholder currents
  };

  try {
    // Call backend API to generate VTU file
    const response = await postprocessorClient.post(
      '/api/export/vtu',
      requestPayload,
      {
        responseType: 'blob', // Important: tell axios to treat response as binary
      }
    );

    // Create blob from response
    const blob = new Blob([response.data], { type: 'application/xml' });

    // Create download link and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.vtu`;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`VTU file exported successfully: ${filename}.vtu`);
  } catch (error: any) {
    console.error('VTU export failed:', error);

    // Extract error message from API response
    let errorMessage = 'Failed to export VTU file';

    if (error.response?.data) {
      // Try to parse error from blob
      try {
        const text = await error.response.data.text();
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorMessage;
      } catch {
        errorMessage = error.message || errorMessage;
      }
    } else {
      errorMessage = error.message || errorMessage;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Check if field data is available for export
 * @param fieldId Field ID to check
 * @param frequencyHz Frequency in Hz
 * @param state Redux state
 * @returns True if field data exists and is valid
 */
export function canExportToVTU(
  fieldId: string,
  frequencyHz: number,
  state: RootState
): boolean {
  const fieldData = state.solver.fieldData?.[fieldId]?.[frequencyHz];
  return !!(
    fieldData &&
    fieldData.points &&
    fieldData.points.length > 0 &&
    (fieldData.E_mag || fieldData.H_mag || fieldData.E_vectors || fieldData.H_vectors)
  );
}
