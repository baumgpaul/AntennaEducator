import { z } from 'zod';

/**
 * Field Definition Types for Solver
 * Defines regions where electromagnetic fields will be computed
 */

// ============================================================================
// Zod Validation Schemas
// ============================================================================

const Point3DSchema = z.object({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  z: z.number().min(-10000).max(10000),
});

const FieldDefinition2DSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  visible: z.boolean().optional().default(true),
  opacity: z.number().min(0).max(1).optional().default(0.3),
  type: z.literal('2D'),
  shape: z.enum(['plane', 'circle']),
  centerPoint: z.tuple([z.number(), z.number(), z.number()]),
  dimensions: z
    .object({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      radius: z.number().positive().optional(),
    })
    .optional(),
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
  shape: z.enum(['sphere', 'cube']),
  centerPoint: z.tuple([z.number(), z.number(), z.number()]),
  sphereRadius: z.number().positive().optional(),
  cubeDimensions: z
    .object({
      Lx: z.number().positive(),
      Ly: z.number().positive(),
      Lz: z.number().positive(),
    })
    .optional(),
  sampling: z.object({
    radial: z.number().int().positive(),
    angular: z.number().int().positive(),
  }),
  fieldType: z.enum(['E', 'H', 'poynting']),
});

export const FieldDefinitionSchema = z.union([FieldDefinition2DSchema, FieldDefinition3DSchema]);

// ============================================================================
// TypeScript Types
// ============================================================================

export type FieldDefinition2D = z.infer<typeof FieldDefinition2DSchema>;
export type FieldDefinition3D = z.infer<typeof FieldDefinition3DSchema>;
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

/**
 * Field Type enumeration
 */
export type FieldType = 'E' | 'H' | 'poynting';

/**
 * Normal preset options for 2D planes
 */
export type NormalPreset = 'XY' | 'YZ' | 'XZ' | 'Custom';

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
  if (field.type === '2D') {
    return field.sampling.x * field.sampling.y;
  } else {
    return field.sampling.radial * field.sampling.angular;
  }
}
