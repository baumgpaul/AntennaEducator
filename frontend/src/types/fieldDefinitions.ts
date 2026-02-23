import { z } from 'zod';

/**
 * Field Definition Types for Solver
 * Defines regions where electromagnetic fields will be computed
 *
 * 1D shapes:
 *   - line: Straight line from start to end point with N samples
 *   - arc: Elliptical arc with center, 2 axis vectors, 2 radii, start/end angle
 *
 * 2D shapes:
 *   - plane: Rectangular region with width/height, normal preset or custom
 *   - ellipse: Elliptical region with 2 axis vectors and 2 radii
 *              (circular when radiusA === radiusB)
 *
 * 3D shapes:
 *   - sphere: Spherical shell sampled with theta, phi, radial
 *   - cuboid: Axis-aligned box with Lx/Ly/Lz dimensions and Nx/Ny/Nz resolution
 */

// ============================================================================
// Zod Validation Schemas
// ============================================================================

const Point3DSchema = z.object({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  z: z.number().min(-10000).max(10000),
});

const FieldDefinition1DSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  visible: z.boolean().optional().default(true),
  opacity: z.number().min(0).max(1).optional().default(0.3),
  type: z.literal('1D'),
  shape: z.enum(['line', 'arc']),
  // Common: number of sampling points
  numPoints: z.number().int().positive().min(2),
  // Line: start and end points
  startPoint: z.tuple([z.number(), z.number(), z.number()]).optional(),
  endPoint: z.tuple([z.number(), z.number(), z.number()]).optional(),
  // Arc: center, axis vectors, radii, angles
  centerPoint: z.tuple([z.number(), z.number(), z.number()]).optional(),
  axis1: z.tuple([z.number(), z.number(), z.number()]).optional(),
  axis2: z.tuple([z.number(), z.number(), z.number()]).optional(),
  radiusA: z.number().positive().optional(),
  radiusB: z.number().positive().optional(),
  startAngle: z.number().optional(),  // degrees
  endAngle: z.number().optional(),    // degrees
  // Orientation preset for arcs (XY, XZ, YZ, Custom)
  normalPreset: z.enum(['XY', 'YZ', 'XZ', 'Custom']).optional(),
  fieldType: z.enum(['E', 'H', 'poynting']),
});

const FieldDefinition2DSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  visible: z.boolean().optional().default(true),
  opacity: z.number().min(0).max(1).optional().default(0.3),
  type: z.literal('2D'),
  shape: z.enum(['plane', 'ellipse']),
  centerPoint: z.tuple([z.number(), z.number(), z.number()]),
  // Plane dimensions
  dimensions: z
    .object({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    })
    .optional(),
  // Ellipse radii (radiusA along axis1, radiusB along axis2)
  radiusA: z.number().positive().optional(),
  radiusB: z.number().positive().optional(),
  // Ellipse axis directions (unit vectors defining the ellipse plane & axes)
  axis1: z.tuple([z.number(), z.number(), z.number()]).optional(),
  axis2: z.tuple([z.number(), z.number(), z.number()]).optional(),
  // Normal / preset for plane (and as preset selector for ellipse)
  normalVector: z.tuple([z.number(), z.number(), z.number()]).optional(),
  normalPreset: z.enum(['XY', 'YZ', 'XZ', 'Custom']).optional(),
  sampling: z.object({
    x: z.number().int().positive(),
    y: z.number().int().positive(),
  }),
  fieldType: z.enum(['E', 'H', 'poynting']),
});

const FieldDefinition3DSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  visible: z.boolean().optional().default(true),
  opacity: z.number().min(0).max(1).optional().default(0.3),
  type: z.literal('3D'),
  shape: z.enum(['sphere', 'cuboid']),
  centerPoint: z.tuple([z.number(), z.number(), z.number()]),
  sphereRadius: z.number().positive().optional(),
  cuboidDimensions: z
    .object({
      Lx: z.number().positive(),
      Ly: z.number().positive(),
      Lz: z.number().positive(),
    })
    .optional(),
  // Sphere sampling: theta (elevation), phi (azimuth), radial
  // Cuboid sampling: Nx, Ny, Nz grid resolution
  sampling: z.union([
    z.object({
      theta: z.number().int().positive(),
      phi: z.number().int().positive(),
      radial: z.number().int().positive(),
    }),
    z.object({
      Nx: z.number().int().positive(),
      Ny: z.number().int().positive(),
      Nz: z.number().int().positive(),
    }),
  ]),
  fieldType: z.enum(['E', 'H', 'poynting']),
});

export const FieldDefinitionSchema = z.union([
  FieldDefinition1DSchema,
  FieldDefinition2DSchema,
  FieldDefinition3DSchema,
]);

// ============================================================================
// TypeScript Types
// ============================================================================

export type FieldDefinition1D = z.infer<typeof FieldDefinition1DSchema>;
export type FieldDefinition2D = z.infer<typeof FieldDefinition2DSchema>;
export type FieldDefinition3D = z.infer<typeof FieldDefinition3DSchema>;
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

/**
 * Field Type enumeration
 */
export type FieldType = 'E' | 'H' | 'poynting';

/**
 * Normal preset options for 2D planes / ellipse orientation
 */
export type NormalPreset = 'XY' | 'YZ' | 'XZ' | 'Custom';

/**
 * Sphere sampling parameters
 */
export interface SphereSampling {
  theta: number;
  phi: number;
  radial: number;
}

/**
 * Cuboid sampling parameters
 */
export interface CuboidSampling {
  Nx: number;
  Ny: number;
  Nz: number;
}

/**
 * Helper: get axis vectors from a normal preset for ellipse orientation
 */
export function getEllipseAxesFromPreset(
  preset: Exclude<NormalPreset, 'Custom'>,
): { axis1: [number, number, number]; axis2: [number, number, number] } {
  switch (preset) {
    case 'XY':
      return { axis1: [1, 0, 0], axis2: [0, 1, 0] };
    case 'XZ':
      return { axis1: [1, 0, 0], axis2: [0, 0, 1] };
    case 'YZ':
      return { axis1: [0, 1, 0], axis2: [0, 0, 1] };
  }
}

/**
 * Validate a field definition
 */
export function validateFieldDefinition(field: unknown): { valid: boolean; error?: string } {
  const result = FieldDefinitionSchema.safeParse(field);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, error: result.error.issues[0]?.message || 'Invalid field definition' };
}

/**
 * Get human-readable name for a field definition
 */
export function getFieldDisplayName(field: FieldDefinition, index: number): string {
  return `Field ${index + 1}: ${field.fieldType} (${field.type} ${field.shape})`;
}

/**
 * Calculate total sampling points for a field definition
 */
export function getTotalSamplingPoints(field: FieldDefinition): number {
  if (field.type === '1D') {
    return field.numPoints;
  } else if (field.type === '2D') {
    return field.sampling.x * field.sampling.y;
  } else {
    const s = field.sampling;
    if ('Nx' in s) {
      return s.Nx * s.Ny * s.Nz;
    }
    return s.theta * s.phi * s.radial;
  }
}
