/**
 * FEM result visualization types.
 */

export type DisplayMode = 'contour' | 'contour_lines' | 'both'

export type ColorMapName = 'viridis' | 'jet' | 'coolwarm' | 'plasma' | 'inferno'

export interface LinePlotConfig {
  id: string
  startPoint: [number, number]
  endPoint: [number, number]
  fieldName: string
  nPoints: number
}

export interface LinePlotData {
  distances: number[]
  values: number[]
  xCoords: number[]
  yCoords: number[]
}

export interface PointProbe {
  id: string
  x: number
  y: number
}

export interface PointProbeResult {
  probeId: string
  fields: Record<string, number>
}

export interface FieldVisualizationData {
  nodePositions: [number, number][]
  elementConnectivity: number[][]
  scalarValues: number[] | null
  colorMapRange: [number, number] | null
  arrowPositions: [number, number][] | null
  arrowDirections: [number, number][] | null
  arrowMagnitudes: number[] | null
}
