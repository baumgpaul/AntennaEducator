/**
 * Preprocessor API client
 * Handles antenna geometry creation and mesh generation
 */

import { preprocessorClient, handleApiResponse } from './client'
import type {
  DipoleConfig,
  LoopConfig,
  HelixConfig,
  RodConfig,
  PreprocessorResponse,
} from '@/types/models'

// ============================================================================
// Health Check
// ============================================================================

export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await preprocessorClient.get('/health')
  return handleApiResponse(response)
}

// ============================================================================
// Antenna Builders
// ============================================================================

/**
 * Create a dipole antenna
 */
export const createDipole = async (
  config: DipoleConfig
): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/dipole', config)
  return handleApiResponse(response)
}

/**
 * Create a loop antenna (circular, rectangular, or polygon)
 */
export const createLoop = async (config: LoopConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/loop', config)
  return handleApiResponse(response)
}

/**
 * Create a helical antenna
 */
export const createHelix = async (config: HelixConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/helix', config)
  return handleApiResponse(response)
}

/**
 * Create a rod (monopole) antenna
 */
export const createRod = async (config: RodConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/rod', config)
  return handleApiResponse(response)
}

// ============================================================================
// Mesh Operations
// ============================================================================

/**
 * Validate antenna geometry
 */
export const validateGeometry = async (mesh: any): Promise<{ valid: boolean; errors?: string[] }> => {
  const response = await preprocessorClient.post('/validate', mesh)
  return handleApiResponse(response)
}

/**
 * Export geometry to file
 */
export const exportGeometry = async (
  mesh: any,
  format: 'json' | 'vtk'
): Promise<Blob> => {
  const response = await preprocessorClient.post(
    '/export',
    { mesh, format },
    { responseType: 'blob' }
  )
  return response.data
}

// ============================================================================
// Convenience wrappers for dialogs
// ============================================================================

/**
 * Generate dipole mesh from dialog form data
 */
export const generateDipoleMesh = async (formData: {
  name: string;
  length: number;
  radius: number;
  gap: number;
  frequency: number;
  segments: number;
  feedType: 'gap' | 'balanced';
}): Promise<PreprocessorResponse> => {
  const config: DipoleConfig = {
    length: formData.length,
    wire_radius: formData.radius,
    gap: formData.gap,
    segments: formData.segments,
    balanced_feed: formData.feedType === 'balanced',
    // Default values
    center_position: [0, 0, 0],
    orientation: [0, 0, 1], // Vertical along Z-axis
  };
  
  return createDipole(config);
};

/**
 * Generate loop mesh from dialog form data
 */
export const generateLoopMesh = async (formData: {
  name: string;
  loopType: 'circular' | 'rectangular' | 'polygon';
  radius?: number;
  width?: number;
  height?: number;
  sides?: number;
  circumradius?: number;
  wireRadius: number;
  frequency: number;
  segments: number;
}): Promise<PreprocessorResponse> => {
  const baseConfig = {
    loop_type: formData.loopType,
    wire_radius: formData.wireRadius,
    segments: formData.segments,
    center_position: [0, 0, 0] as [number, number, number],
    normal_vector: [0, 0, 1] as [number, number, number], // Loop in XY plane
  };

  let config: LoopConfig;

  if (formData.loopType === 'circular') {
    config = {
      ...baseConfig,
      loop_type: 'circular',
      radius: formData.radius!,
    };
  } else if (formData.loopType === 'rectangular') {
    config = {
      ...baseConfig,
      loop_type: 'rectangular',
      width: formData.width!,
      height: formData.height!,
    };
  } else {
    // polygon - generate regular polygon vertices
    const sides = formData.sides!;
    const r = formData.circumradius!;
    const vertices: [number, number, number][] = [];
    
    for (let i = 0; i < sides; i++) {
      const angle = (2 * Math.PI * i) / sides;
      vertices.push([
        r * Math.cos(angle),
        r * Math.sin(angle),
        0,
      ]);
    }

    config = {
      ...baseConfig,
      loop_type: 'polygon',
      vertices,
    };
  }

  return createLoop(config);
};

// Export all functions as a single object
const preprocessorApi = {
  checkHealth,
  createDipole,
  createLoop,
  createHelix,
  createRod,
  validateGeometry,
  exportGeometry,
  generateDipoleMesh,
  generateLoopMesh,
}

export default preprocessorApi
