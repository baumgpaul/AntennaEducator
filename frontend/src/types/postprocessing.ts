/**
 * Type definitions for the Postprocessing Tab Multi-View Configuration System
 *
 * This module defines the data structures for:
 * - View configurations (3D and Line views)
 * - View items (antenna elements, fields, plots)
 * - Redux state for postprocessing
 */

/**
 * Type of view configuration
 * - 3D: 3D visualization with antennas, fields, directivity
 * - Line: Scalar result plots (impedance, voltage, current vs frequency)
 */
export type ViewType = '3D' | 'Line';

/**
 * Type of item that can be added to a view
 *
 * 3D View Items:
 * - antenna-system: All antennas from Designer (single tree item)
 * - single-antenna: Individual antenna from Designer
 * - current: Edge currents from solver
 * - voltage: Node potentials from solver
 * - field-magnitude: Scalar color-mapped field surface
 * - field-magnitude-component: Single component of field magnitude
 * - field-vector: Arrow field visualization
 * - field-vector-component: Single component of field vector
 * - directivity: Far-field radiation pattern
 *
 * Line View Items:
 * - scalar-plot: Generic scalar data plot (impedance, voltage, current vs frequency)
 */
export type ViewItemType =
  | 'antenna-system'
  | 'single-antenna'
  | 'current'
  | 'voltage'
  | 'field-magnitude'
  | 'field-magnitude-component'
  | 'field-vector'
  | 'field-vector-component'
  | 'directivity'
  | 'scalar-plot';

/**
 * Settings for scalar plot visualization
 */
export interface PlotSettings {
  /** Show grid lines on plot */
  showGrid: boolean;
  /** Show legend */
  showLegend: boolean;
  /** Y-axis scale type */
  yAxisScale: 'linear' | 'log';
  /** Line color (hex or named color) */
  lineColor?: string;
  /** Line width in pixels */
  lineWidth?: number;
}

/**
 * A single item within a view configuration
 *
 * Each item represents a visual element (antenna, field, plot) that can be
 * displayed in the view. Items have type-specific properties.
 */
export interface ViewItem {
  /** Unique identifier for this item */
  id: string;
  /** Type of item */
  type: ViewItemType;
  /** Custom display name (defaults to auto-generated) */
  label?: string;
  /** Visibility toggle state */
  visible: boolean;

  // Type-specific references
  /** Reference to antenna ID (for single-antenna) */
  antennaId?: string;
  /** Reference to field definition ID (for field-magnitude/field-vector) */
  fieldId?: string;
  /** Port number (for port-specific items) */
  portNumber?: number;
  /** Plot settings (for Line view items) */
  plotSettings?: PlotSettings;

  // ===== Phase 2: Item Property Editors =====
  // Common visualization properties
  /** Opacity 0-1 (rendered as 0-100%) */
  opacity?: number;
  /** Hex color (e.g., '#FF8C00') for solid coloring */
  color?: string;

  // Color mapping (for current, voltage, field-magnitude, field-vector, directivity)
  /** Color map name ('jet' | 'turbo' | 'viridis' | 'plasma' | 'twilight') */
  colorMap?: string;
  /** Whether to show a colorbar legend for this item */
  showColorbar?: boolean;
  /** Phase angle in degrees (0-360) for instantaneous field visualization */
  phase?: number;

  // Value range control
  /** Value range mode: 'auto' (from data) or 'manual' (user-specified) */
  valueRangeMode?: 'auto' | 'manual';
  /** Minimum value for manual range */
  valueRangeMin?: number;
  /** Maximum value for manual range */
  valueRangeMax?: number;

  // Geometry sizing
  /** Edge size for current distributions (line width multiplier) */
  edgeSize?: number;
  /** Node size for voltage distributions (point size multiplier) */
  nodeSize?: number;
  /** Line width for 1D field visualizations (tube radius in mm) */
  lineWidth?: number;
  /** Arrow size for field vectors (arrow scale in meters) */
  arrowSize?: number;
  /** Arrow density: show every Nth arrow (1 = all, 2 = every 2nd, etc.) */
  arrowDensity?: number;
  /** Arrow display mode: 'every-nth' (regular sampling) or 'random' (random sampling) */
  arrowDisplayMode?: 'every-nth' | 'random';
  /** Number of random arrows to display (when arrowDisplayMode is 'random') */
  randomArrowCount?: number;
  /** Arrow scaling mode: 'magnitude' (scaled by field strength) or 'uniform' (constant length) */
  arrowScalingMode?: 'magnitude' | 'uniform';
  /** Size factor for directivity patterns (overall scale) */
  sizeFactor?: number;

  // Field smoothing
  /** Enable smooth shading for field magnitude surfaces */
  smoothShading?: boolean;
  /** Interpolation level for field surfaces (1 = none, 2 = 2x, 4 = 4x, 8 = 8x subdivision) */
  interpolationLevel?: 1 | 2 | 4 | 8;

  // Vector complex part selection
  /** Which part of the complex vector to visualize */
  vectorComplexPart?: 'real' | 'imaginary' | 'magnitude';

  // Time animation
  /** Enable time animation for harmonic field visualization */
  animationEnabled?: boolean;
  /** Animation speed in cycles per second (0.5–3, default 1) */
  animationSpeed?: number;

  // Saved manual range (persists across auto/manual toggles)
  /** Saved manual min when switching to auto */
  savedManualMin?: number;
  /** Saved manual max when switching to auto */
  savedManualMax?: number;

  // Line plot properties
  /** Line style for scalar plots */
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
  /** Y-axis scale for scalar plots */
  yAxisScale?: 'linear' | 'log';

  // Directivity scale
  /** Scale for directivity pattern (linear or logarithmic dBi) */
  scale?: 'linear' | 'logarithmic';
}

/**
 * A view configuration represents a complete visualization setup
 *
 * Users can create multiple views to explore results from different perspectives.
 * Each view has its own set of items and settings.
 */
export interface ViewConfiguration {
  /** Unique identifier for this view */
  id: string;
  /** Display name (e.g., "Result View 1") */
  name: string;
  /** Type of view (3D or Line) */
  viewType: ViewType;
  /** Selected frequency for 3D views (Hz), undefined for Line views */
  selectedFrequencyHz?: number;
  /** Items to display in this view */
  items: ViewItem[];
  /** Timestamp when view was created */
  createdAt: string;
  /** Timestamp when view was last modified */
  updatedAt: string;
}

/**
 * Redux state for postprocessing tab
 */
export interface PostprocessingState {
  /** All view configurations */
  viewConfigurations: ViewConfiguration[];
  /** ID of currently selected view (shown in middle panel) */
  selectedViewId: string | null;
  /** ID of currently selected item (shown in properties panel) */
  selectedItemId: string | null;

  // Dialog states
  /** Add View dialog open state */
  addViewDialogOpen: boolean;
  /** Add Antenna Element dialog open state */
  addAntennaDialogOpen: boolean;
  /** Add Field Visualization dialog open state */
  addFieldDialogOpen: boolean;
  /** Add Scalar Plot dialog open state */
  addScalarPlotDialogOpen: boolean;
  /** Pre-selected data type for scalar plot dialog */
  scalarPlotPreselect: 'impedance' | 'voltage' | 'current' | null;

  // Export states
  /** Export to PDF dialog open state */
  exportPDFDialogOpen: boolean;
  /** Current export operation type */
  exportType: 'pdf' | 'paraview' | null;
}

/**
 * Default values for new view configurations
 */
export const DEFAULT_VIEW_CONFIG: Omit<ViewConfiguration, 'id' | 'name' | 'createdAt' | 'updatedAt'> = {
  viewType: '3D',
  selectedFrequencyHz: undefined,
  items: [],
};

/**
 * Default plot settings for scalar plots
 */
export const DEFAULT_PLOT_SETTINGS: PlotSettings = {
  showGrid: true,
  showLegend: true,
  yAxisScale: 'linear',
  lineWidth: 2,
};

/**
 * Maximum number of view configurations allowed per project
 */
export const MAX_VIEW_CONFIGURATIONS = 10;

/**
 * Generate a default view name based on existing views
 */
export function generateDefaultViewName(existingViews: ViewConfiguration[]): string {
  let counter = 1;
  let name = `Result View ${counter}`;

  while (existingViews.some(v => v.name === name)) {
    counter++;
    name = `Result View ${counter}`;
  }

  return name;
}

/**
 * Generate a default label for a view item based on its type
 */
export function generateDefaultItemLabel(type: ViewItemType, existingItems: ViewItem[]): string {
  const baseLabels: Record<ViewItemType, string> = {
    'antenna-system': 'Antenna System',
    'single-antenna': 'Antenna',
    'current': 'Current',
    'voltage': 'Voltage',
    'field-magnitude': 'Field Magnitude',
    'field-magnitude-component': 'Field Component',
    'field-vector': 'Field Vector',
    'field-vector-component': 'Field Vector Component',
    'directivity': 'Directivity',
    'scalar-plot': 'Plot',
  };

  const baseLabel = baseLabels[type];

  // For items that typically have only one instance, return base label
  if (type === 'antenna-system' || type === 'directivity') {
    return baseLabel;
  }

  // For items that can have multiple instances, add counter
  let counter = 1;
  let label = baseLabel;

  while (existingItems.some(item => item.label === label || (item.type === type && !item.label))) {
    counter++;
    label = `${baseLabel} ${counter}`;
  }

  return label;
}

/**
 * Check if a view type allows a specific item type
 */
export function isItemTypeAllowedInView(itemType: ViewItemType, viewType: ViewType): boolean {
  const threeDItems: ViewItemType[] = [
    'antenna-system',
    'single-antenna',
    'current',
    'voltage',
    'field-magnitude',
    'field-magnitude-component',
    'field-vector',
    'field-vector-component',
    'directivity',
  ];

  const lineItems: ViewItemType[] = [
    'scalar-plot',
  ];

  if (viewType === '3D') {
    return threeDItems.includes(itemType);
  } else {
    return lineItems.includes(itemType);
  }
}
