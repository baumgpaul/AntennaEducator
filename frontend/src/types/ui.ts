/**
 * UI-specific types and interfaces
 */

import type { Vector3D } from './models'

// ============================================================================
// UI State Types
// ============================================================================

export type ViewMode = '3d' | 'tree' | 'properties'
export type EditMode = 'select' | 'add' | 'edit' | 'delete'

export interface UIState {
  viewMode: ViewMode
  editMode: EditMode
  selectedElementId?: string
  sidebarOpen: boolean
  propertiesPanelOpen: boolean
  loading: boolean
  error?: string
}

// ============================================================================
// 3D Visualization Types
// ============================================================================

export interface Camera {
  position: Vector3D
  target: Vector3D
  fov: number
  near: number
  far: number
}

export interface SceneSettings {
  backgroundColor: string
  gridVisible: boolean
  axesVisible: boolean
  wireframeMode: boolean
  showLabels: boolean
}

export interface WireRenderProps {
  start: Vector3D
  end: Vector3D
  radius: number
  color?: string
  selected?: boolean
  opacity?: number
}

export interface NodeRenderProps {
  position: Vector3D
  radius?: number
  color?: string
  label?: string
  selected?: boolean
}

// ============================================================================
// Tree View Types
// ============================================================================

export type TreeNodeType =
  | 'root'
  | 'antenna'
  | 'dipole'
  | 'loop'
  | 'helix'
  | 'rod'
  | 'source'
  | 'lumped_element'
  | 'mesh'
  | 'node'
  | 'edge'

export interface TreeNode {
  id: string
  type: TreeNodeType
  label: string
  icon?: string
  children?: TreeNode[]
  data?: any
  expanded?: boolean
  selected?: boolean
}

// ============================================================================
// Dialog and Form Types
// ============================================================================

export interface DialogState {
  open: boolean
  title: string
  mode: 'create' | 'edit'
  data?: any
}

export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'vector3d' | 'complex'
  value: any
  required?: boolean
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: any }[]
  error?: string
  helperText?: string
}

export interface FormState {
  fields: Record<string, FormField>
  valid: boolean
  touched: boolean
  submitting: boolean
}

// ============================================================================
// Chart and Plot Types
// ============================================================================

export interface PlotDataPoint {
  x: number
  y: number
  label?: string
}

export interface PlotSeries {
  name: string
  data: PlotDataPoint[]
  color?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  marker?: 'circle' | 'square' | 'triangle'
}

export interface PlotConfig {
  title: string
  xLabel: string
  yLabel: string
  xScale?: 'linear' | 'log'
  yScale?: 'linear' | 'log'
  legend?: boolean
  grid?: boolean
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

// ============================================================================
// Theme Types
// ============================================================================

export type ThemeMode = 'light' | 'dark'

export interface ThemeColors {
  primary: string
  secondary: string
  success: string
  error: string
  warning: string
  info: string
  background: string
  surface: string
  text: string
}

// ============================================================================
// Navigation Types
// ============================================================================

export interface NavItem {
  label: string
  path: string
  icon?: string
  children?: NavItem[]
  badge?: number
  disabled?: boolean
}

export interface BreadcrumbItem {
  label: string
  path?: string
}

// ============================================================================
// Table Types
// ============================================================================

export interface TableColumn<T = any> {
  id: string
  label: string
  field?: keyof T
  sortable?: boolean
  filterable?: boolean
  format?: (value: any) => string
  align?: 'left' | 'center' | 'right'
  width?: string | number
}

export interface TableState<T = any> {
  data: T[]
  columns: TableColumn<T>[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filter?: string
  page: number
  pageSize: number
  totalRows: number
  selectedRows: string[]
}

// ============================================================================
// Loading States
// ============================================================================

export interface LoadingState {
  isLoading: boolean
  progress?: number
  message?: string
}

export interface AsyncState<T> {
  data?: T
  loading: boolean
  error?: string
  timestamp?: number
}
