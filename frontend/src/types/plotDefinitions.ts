/**
 * Unified plot data model for the postprocessing view system.
 *
 * Defines trace sources (port, field, far-field, distribution),
 * axis configuration, and plot configuration structures used by
 * UnifiedLinePlot, SmithChartViewPanel, PolarPlot, and PortQuantityTable.
 */

// ============================================================================
// Plot Quantity — what data a trace represents
// ============================================================================

/** Port quantities (impedance, reflection, VSWR) — typically vs. frequency or swept variable. */
export interface PortPlotQuantity {
  source: 'port';
  quantity:
    | 'impedance_real'
    | 'impedance_imag'
    | 'impedance_magnitude'
    | 'impedance_phase'
    | 'reflection_coefficient_magnitude'
    | 'reflection_coefficient_phase'
    | 'return_loss'
    | 'vswr'
    | 'port_voltage_magnitude'
    | 'port_voltage_phase'
    | 'port_current_magnitude'
    | 'port_current_phase';
}

/** Field quantities (E/H components) — typically vs. distance along observation line. */
export interface FieldPlotQuantity {
  source: 'field';
  fieldId: string;
  quantity:
    | 'E_magnitude'
    | 'H_magnitude'
    | 'S_magnitude'
    | 'Ex'
    | 'Ey'
    | 'Ez'
    | 'Er'
    | 'Etheta'
    | 'Ephi'
    | 'Hx'
    | 'Hy'
    | 'Hz'
    | 'Hr'
    | 'Htheta'
    | 'Hphi';
}

/** Far-field radiation quantities — typically vs. angle. */
export interface FarfieldPlotQuantity {
  source: 'farfield';
  quantity: 'directivity' | 'gain' | 'E_theta' | 'E_phi';
}

/** Current/voltage distribution along the wire — vs. edge/node index or distance. */
export interface DistributionPlotQuantity {
  source: 'distribution';
  quantity:
    | 'current_magnitude'
    | 'current_phase'
    | 'voltage_magnitude'
    | 'voltage_phase';
}

export type PlotQuantity =
  | PortPlotQuantity
  | FieldPlotQuantity
  | FarfieldPlotQuantity
  | DistributionPlotQuantity;

// ============================================================================
// Trace — a single line on a line plot
// ============================================================================

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface PlotTrace {
  id: string;
  quantity: PlotQuantity;
  /** Legend label (auto-generated from quantity if empty). */
  label: string;
  /** Line color (hex, e.g. '#1976d2'). */
  color: string;
  lineStyle: LineStyle;
  /** Which Y-axis this trace binds to. */
  yAxisId: 'left' | 'right';
  /** Which antenna element to extract data from (0-based). Defaults to 0. */
  antennaIndex?: number;
}

// ============================================================================
// Axis Configuration
// ============================================================================

export type AxisScale = 'linear' | 'log' | 'dB';

export interface AxisConfig {
  label: string;
  unit: string;
  scale: AxisScale;
}

// ============================================================================
// Smith Chart data source
// ============================================================================

export type SmithDataSource = 'frequency-sweep' | 'parameter-study';

// ============================================================================
// Table column definition
// ============================================================================

export interface TableColumn {
  key: string;
  label: string;
  unit: string;
}

/** Standard port quantity table columns. */
export const PORT_TABLE_COLUMNS: TableColumn[] = [
  { key: 'frequency', label: 'Frequency', unit: 'MHz' },
  { key: 'zReal', label: 'Re(Z)', unit: 'Ω' },
  { key: 'zImag', label: 'Im(Z)', unit: 'Ω' },
  { key: 'zMag', label: '|Z|', unit: 'Ω' },
  { key: 'zPhase', label: '∠Z', unit: '°' },
  { key: 'gammaMag', label: '|Γ|', unit: '' },
  { key: 'returnLoss', label: 'Return Loss', unit: 'dB' },
  { key: 'vswr', label: 'VSWR', unit: '' },
];

// ============================================================================
// Default trace colors (auto-assigned in order)
// ============================================================================

export const TRACE_COLORS = [
  '#1976d2', // blue
  '#d32f2f', // red
  '#388e3c', // green
  '#f57c00', // orange
  '#7b1fa2', // purple
  '#00838f', // teal
  '#c2185b', // pink
  '#455a64', // blue-grey
] as const;
