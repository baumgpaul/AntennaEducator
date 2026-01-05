/**
 * Field Generation Utilities
 * Convert field definitions to observation points for postprocessor
 */

import type { FieldDefinition, FieldDefinition2D, FieldDefinition3D } from '@/types/fieldDefinitions';

/**
 * Generate observation points from field definition
 * @param field Field definition (2D or 3D)
 * @returns Array of observation points [[x,y,z], ...]
 */
export function generateObservationPoints(field: FieldDefinition): number[][] {
  if (field.type === '2D') {
    return generate2DObservationPoints(field);
  } else {
    return generate3DObservationPoints(field);
  }
}

/**
 * Generate observation points for 2D field (plane or circle)
 */
function generate2DObservationPoints(field: FieldDefinition2D): number[][] {
  const points: number[][] = [];
  // Convert center point from mm to m
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];
  const { x: nx, y: ny } = field.sampling;

  if (field.shape === 'plane') {
    // Get dimensions in mm, convert to meters
    const width = (field.dimensions?.width ?? 100.0) / 1000.0;  // mm to m
    const height = (field.dimensions?.height ?? 100.0) / 1000.0;  // mm to m

    // Determine normal vector
    let normal: [number, number, number];
    if (field.normalPreset) {
      switch (field.normalPreset) {
        case 'XY':
          normal = [0, 0, 1]; // Normal to XY plane
          break;
        case 'YZ':
          normal = [1, 0, 0]; // Normal to YZ plane
          break;
        case 'XZ':
          normal = [0, 1, 0]; // Normal to XZ plane
          break;
      }
    } else if (field.normalVector) {
      normal = [
        field.normalVector[0] ?? 0,
        field.normalVector[1] ?? 0,
        field.normalVector[2] ?? 1,
      ];
    } else {
      normal = [0, 0, 1]; // Default to XY plane
    }

    // Generate orthogonal basis vectors in the plane
    const { u, v } = getOrthogonalBasis(normal);

    // Sample the plane
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        // Parametric coordinates from -0.5 to 0.5
        const s = (i / (nx - 1) - 0.5) * width;
        const t = (j / (ny - 1) - 0.5) * height;

        // Point in 3D space
        const x = cx + s * u[0] + t * v[0];
        const y = cy + s * u[1] + t * v[1];
        const z = cz + s * u[2] + t * v[2];

        points.push([x, y, z]);
      }
    }
  } else if (field.shape === 'circle') {
    const radius = (field.dimensions?.radius ?? 50.0) / 1000.0;  // mm to m

    // Determine normal vector (same as plane)
    let normal: [number, number, number];
    if (field.normalPreset) {
      switch (field.normalPreset) {
        case 'XY':
          normal = [0, 0, 1];
          break;
        case 'YZ':
          normal = [1, 0, 0];
          break;
        case 'XZ':
          normal = [0, 1, 0];
          break;
      }
    } else if (field.normalVector) {
      normal = [
        field.normalVector[0] ?? 0,
        field.normalVector[1] ?? 0,
        field.normalVector[2] ?? 1,
      ];
    } else {
      normal = [0, 0, 1];
    }

    const { u, v } = getOrthogonalBasis(normal);

    // Sample in polar coordinates
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        // Radial and angular coordinates
        const r = (i / (nx - 1)) * radius;
        const theta = (j / ny) * 2 * Math.PI;

        // Point in local coords
        const s = r * Math.cos(theta);
        const t = r * Math.sin(theta);

        // Point in 3D space
        const x = cx + s * u[0] + t * v[0];
        const y = cy + s * u[1] + t * v[1];
        const z = cz + s * u[2] + t * v[2];

        points.push([x, y, z]);
      }
    }
  }

  return points;
}

/**
 * Generate observation points for 3D field (sphere or cube)
 */
function generate3DObservationPoints(field: FieldDefinition3D): number[][] {
  const points: number[][] = [];
  // Convert center point from mm to m
  const [cx, cy, cz] = [field.centerPoint[0] / 1000, field.centerPoint[1] / 1000, field.centerPoint[2] / 1000];
  const { radial: nr, angular: ntheta } = field.sampling;

  if (field.shape === 'sphere') {
    const radius = (field.sphereRadius ?? 100.0) / 1000.0;  // mm to m
    const nphi = ntheta; // Use same angular sampling for both angles

    // Sample in spherical coordinates
    for (let i = 0; i < nr; i++) {
      const r = (i / (nr - 1)) * radius;
      
      for (let j = 0; j < ntheta; j++) {
        const theta = (j / (ntheta - 1)) * Math.PI; // 0 to π
        
        for (let k = 0; k < nphi; k++) {
          const phi = (k / nphi) * 2 * Math.PI; // 0 to 2π

          // Convert to Cartesian
          const x = cx + r * Math.sin(theta) * Math.cos(phi);
          const y = cy + r * Math.sin(theta) * Math.sin(phi);
          const z = cz + r * Math.cos(theta);

          points.push([x, y, z]);
        }
      }
    }
  } else if (field.shape === 'cube') {
    // Convert cube dimensions from mm to m
    const dims = field.cubeDimensions ?? { Lx: 100.0, Ly: 100.0, Lz: 100.0 };
    const { Lx, Ly, Lz } = { Lx: dims.Lx / 1000, Ly: dims.Ly / 1000, Lz: dims.Lz / 1000 };
    
    // Use radial sampling for all 3 dimensions
    const nx = nr;
    const ny = nr;
    const nz = nr;

    // Sample the cube uniformly
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const x = cx + (i / (nx - 1) - 0.5) * Lx;
          const y = cy + (j / (ny - 1) - 0.5) * Ly;
          const z = cz + (k / (nz - 1) - 0.5) * Lz;

          points.push([x, y, z]);
        }
      }
    }
  }

  return points;
}

/**
 * Get orthogonal basis vectors for a plane with given normal
 */
function getOrthogonalBasis(normal: [number, number, number]): {
  u: [number, number, number];
  v: [number, number, number];
} {
  const [nx, ny, nz] = normal;
  
  // Normalize normal vector
  const norm = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const n: [number, number, number] = [nx / norm, ny / norm, nz / norm];

  // Choose u perpendicular to n
  let u: [number, number, number];
  if (Math.abs(n[0]) < 0.9) {
    // Cross n with x-axis
    u = [0, n[2], -n[1]];
  } else {
    // Cross n with y-axis
    u = [-n[2], 0, n[0]];
  }

  // Normalize u
  const u_norm = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  u = [u[0] / u_norm, u[1] / u_norm, u[2] / u_norm];

  // v = n × u
  const v: [number, number, number] = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];

  return { u, v };
}
