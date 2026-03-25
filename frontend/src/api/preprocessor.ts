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
  LumpedElement,
  Source,
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
  const response = await preprocessorClient.post('/api/antenna/dipole', config)
  return handleApiResponse(response)
}

/**
 * Create a loop antenna (circular, rectangular, or polygon)
 */
export const createLoop = async (config: LoopConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/api/antenna/loop', config)
  return handleApiResponse(response)
}

/**
 * Create a helical antenna
 */
export const createHelix = async (config: HelixConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/api/antenna/helix', config)
  return handleApiResponse(response)
}

/**
 * Create a rod (monopole) antenna
 */
export const createRod = async (config: RodConfig): Promise<PreprocessorResponse> => {
  const response = await preprocessorClient.post('/api/antenna/rod', config)
  return handleApiResponse(response)
}

// ============================================================================
// Mesh Operations
// ============================================================================

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
  sourceType?: 'voltage' | 'current';
  sourceAmplitude?: number;
  sourcePhase?: number;
  position?: { x: number; y: number; z: number };
  orientation?: { x: number; y: number; z: number };
}): Promise<PreprocessorResponse> => {
  // Use orientation vector directly (backend will normalize it)
  const orientX = formData.orientation?.x || 0;
  const orientY = formData.orientation?.y || 0;
  const orientZ = formData.orientation?.z || 1; // Default to Z-axis

  // Convert polar (amplitude + phase) to cartesian (real + imag)
  const amplitude = formData.sourceAmplitude ?? 1;
  const phaseDeg = formData.sourcePhase ?? 0;
  const phaseRad = (phaseDeg * Math.PI) / 180;
  const real = amplitude * Math.cos(phaseRad);
  const imag = amplitude * Math.sin(phaseRad);

  const config: DipoleConfig = {
    length: formData.length,
    wire_radius: formData.radius,
    gap: formData.gap,
    segments: formData.segments,
    balanced_feed: formData.feedType === 'balanced',
    // Always generate at origin - frontend will apply position offset
    center_position: [0, 0, 0],
    // Use orientation vector directly
    orientation: [orientX, orientY, orientZ],
    // Source from dialog configuration
    source: {
      type: formData.sourceType || 'voltage',
      amplitude: { real, imag },
      node_start: 1,
      node_end: 2,
      position: 'center',
    },
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
  feedGap: number;
  frequency: number;
  segments: number;
  position?: { x: number; y: number; z: number };
  orientation?: { rotX: number; rotY: number; rotZ: number };
}): Promise<PreprocessorResponse> => {
  const baseConfig = {
    loop_type: formData.loopType,
    wire_radius: formData.wireRadius,
    gap: formData.feedGap,
    segments: formData.segments,
    // Always generate at origin - frontend will apply position offset
    center_position: [0, 0, 0] as [number, number, number],
    normal_vector: [0, 0, 1] as [number, number, number], // Loop in XY plane, normal points up (Z)
    // Add default voltage source (two symmetric sources like dipole)
    source: {
      type: 'voltage' as const,
      amplitude: { real: 1.0, imag: 0.0 },
      series_R: 0.0,
      series_L: 0.0,
      series_C_inv: 0.0,
      tag: 'Feed',
    },
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

// Wrapper function for helix dialog
export async function generateHelixMesh(formData: any): Promise<PreprocessorResponse> {
  const config: HelixConfig = {
    radius: formData.diameter / 2,
    pitch: formData.pitch,
    turns: formData.turns,
    wire_radius: formData.wire_radius,
    // Always generate at origin - frontend will apply position offset
    center_position: [0, 0, 0],
    axis_direction: [0, 0, 1], // Helix grows along Z-axis (up)
    start_angle: 0,
    segments_per_turn: formData.segments_per_turn,
    helix_mode: formData.helix_mode,
    polarization: formData.polarization,
    // Add default voltage source (feeding against node 0)
    source: {
      type: 'voltage' as const,
      amplitude: { real: 1.0, imag: 0.0 },
      series_R: 0.0,
      series_L: 0.0,
      series_C_inv: 0.0,
      tag: 'Feed',
    },
  }

  return createHelix(config)
}

// Wrapper function for rod dialog
export async function generateRodMesh(formData: any): Promise<PreprocessorResponse> {
  const startPoint: [number, number, number] = [formData.start_x, formData.start_y, formData.start_z]
  const endPoint: [number, number, number] = [formData.end_x, formData.end_y, formData.end_z]
  const dx = endPoint[0] - startPoint[0]
  const dy = endPoint[1] - startPoint[1]
  const dz = endPoint[2] - startPoint[2]
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const direction: [number, number, number] = length > 0 ? [dx / length, dy / length, dz / length] : [0, 0, 1]

  const config: RodConfig = {
    length,
    base_position: startPoint,
    direction,
    wire_radius: formData.radius,
    segments: formData.segments,
    start_point: startPoint,
    end_point: endPoint,
  }

  return createRod(config)
}

// Wrapper function for lumped element dialog
export async function addLumpedElementToMesh(formData: any): Promise<LumpedElement> {
  // Convert dialog data to LumpedElement shape
  // Since backend doesn't have a separate endpoint for adding lumped elements,
  // we just return the converted data structure to be stored in Redux
  // and included in the next antenna creation/solver call

  const base: LumpedElement = {
    type: 'rlc',
    node_start: formData.node1,
    node_end: formData.node2,
    R: 0,
    L: 0,
    C_inv: 0,
    tag: formData.antennaId ? `Element on ${formData.antennaId}` : undefined,
  }

  if (formData.element_type === 'R') {
    return { ...base, type: 'resistor', R: formData.resistance }
  }

  if (formData.element_type === 'L') {
    return { ...base, type: 'inductor', L: formData.inductance }
  }

  if (formData.element_type === 'C') {
    return { ...base, type: 'capacitor', C_inv: formData.capacitance_inv }
  }

  // RLC combined (should not happen with current UI, but kept for safety)
  return {
    ...base,
    type: 'rlc',
    R: formData.resistance || 0,
    L: formData.inductance || 0,
    C_inv: formData.capacitance_inv || 0,
  }
}

// Wrapper function for source dialog
export async function addSourceToMesh(formData: any): Promise<Source> {
  // Convert dialog data to Source shape
  // Since backend doesn't have a separate endpoint for adding sources,
  // we just return the converted data structure to be stored in Redux
  // and included in the next solver call

  const source: Source = {
    type: formData.type, // 'voltage' or 'current'
    amplitude: { real: formData.value, imag: 0 }, // Assuming real amplitude from UI
    node_start: formData.node1,
    node_end: formData.node2,
    series_R: formData.seriesR || 0,
    series_L: formData.seriesL || 0,
    series_C_inv: formData.seriesC > 0 ? 1 / formData.seriesC : 0, // Convert C to C_inv
    tag: formData.antennaId ? `Source on ${formData.antennaId}` : undefined,
  }

  return source
}

// Export all functions as a single object (kept at bottom for clarity)
const preprocessorApi = {
  checkHealth,
  createDipole,
  createLoop,
  createHelix,
  createRod,
  generateDipoleMesh,
  generateLoopMesh,
  generateHelixMesh,
  generateRodMesh,
  addLumpedElementToMesh,
  addSourceToMesh,
}

export default preprocessorApi
