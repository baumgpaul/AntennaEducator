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
 * - antenna-element: Individual antenna from Designer
 * - current-distribution: Edge currents from solver
 * - voltage-distribution: Node potentials from solver
 * - field-magnitude: Scalar color-mapped field surface
 * - field-vector: Arrow field visualization
 * - directivity: Far-field radiation pattern
 * 
 * Line View Items:
 * - impedance-plot: Z vs frequency curve
 * - voltage-plot: Port voltage vs frequency
 * - current-plot: Port current vs frequency
 */
export type ViewItemType = 
  | 'antenna-system'
  | 'antenna-element'
  | 'current-distribution'
  | 'voltage-distribution'
  | 'field-magnitude'
  | 'field-vector'
  | 'directivity'
  | 'impedance-plot'
  | 'voltage-plot'
  | 'current-plot';

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
  
  // Type-specific properties
  /** Reference to antenna ID (for antenna-element) */
  antennaId?: string;
  /** Reference to field definition ID (for field-magnitude/field-vector) */
  fieldId?: string;
  /** Color map name (for field visualizations) */
  colorMap?: string;
  /** Opacity 0-1 (for 3D items) */
  opacity?: number;
  /** Port number (for voltage-plot/current-plot) */
  portNumber?: number;
  /** Plot settings (for Line view items) */
  plotSettings?: PlotSettings;
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
    'antenna-element': 'Antenna Element',
    'current-distribution': 'Current Distribution',
    'voltage-distribution': 'Voltage Distribution',
    'field-magnitude': 'Field Magnitude',
    'field-vector': 'Field Vector',
    'directivity': 'Directivity',
    'impedance-plot': 'Impedance',
    'voltage-plot': 'Voltage',
    'current-plot': 'Current',
  };
  
  const baseLabel = baseLabels[type];
  
  // For items that typically have only one instance, return base label
  if (type === 'antenna-system' || type === 'directivity' || type === 'impedance-plot') {
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
    'antenna-element',
    'current-distribution',
    'voltage-distribution',
    'field-magnitude',
    'field-vector',
    'directivity',
  ];
  
  const lineItems: ViewItemType[] = [
    'impedance-plot',
    'voltage-plot',
    'current-plot',
  ];
  
  if (viewType === '3D') {
    return threeDItems.includes(itemType);
  } else {
    return lineItems.includes(itemType);
  }
}
