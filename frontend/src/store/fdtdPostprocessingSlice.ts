/**
 * FDTD Postprocessing Slice
 *
 * Manages multi-view postprocessing system for FDTD results.
 * Follows the same ViewConfiguration pattern as the PEEC postprocessingSlice.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import type {
  FdtdViewConfiguration,
  FdtdViewItem,
  FdtdViewItemType,
  RadiationPatternResponse,
  SarResponse,
  RcsResponse,
  FrequencyFieldResponse,
  SParamResponse,
} from '@/types/fdtd'
import {
  computeRadiationPattern,
  computeSar,
  computeRcs,
  extractFrequencyField,
  computeSParams,
} from '@/api/postprocessorFdtd'
import type { RootState } from './store'

// ============================================================================
// Types
// ============================================================================

const MAX_VIEWS = 10

interface FdtdPostprocessingState {
  viewConfigurations: FdtdViewConfiguration[]
  selectedViewId: string | null
  selectedItemId: string | null
  addViewDialogOpen: boolean

  // Cached computation results (keyed by request hash or type)
  radiationPattern: RadiationPatternResponse | null
  sarResult: SarResponse | null
  rcsResult: RcsResponse | null
  frequencyField: FrequencyFieldResponse | null
  sParams: SParamResponse | null

  // Loading states
  computingRadiation: boolean
  computingSar: boolean
  computingRcs: boolean
  computingFreqField: boolean
  computingSParams: boolean
  computeError: string | null
}

const initialState: FdtdPostprocessingState = {
  viewConfigurations: [],
  selectedViewId: null,
  selectedItemId: null,
  addViewDialogOpen: false,
  radiationPattern: null,
  sarResult: null,
  rcsResult: null,
  frequencyField: null,
  sParams: null,
  computingRadiation: false,
  computingSar: false,
  computingRcs: false,
  computingFreqField: false,
  computingSParams: false,
  computeError: null,
}

// ============================================================================
// Async thunks
// ============================================================================

export const fetchRadiationPattern = createAsyncThunk(
  'fdtdPostprocessing/fetchRadiation',
  async (request: Parameters<typeof computeRadiationPattern>[0]) => {
    return await computeRadiationPattern(request)
  },
)

export const fetchSar = createAsyncThunk(
  'fdtdPostprocessing/fetchSar',
  async (request: Parameters<typeof computeSar>[0]) => {
    return await computeSar(request)
  },
)

export const fetchRcs = createAsyncThunk(
  'fdtdPostprocessing/fetchRcs',
  async (request: Parameters<typeof computeRcs>[0]) => {
    return await computeRcs(request)
  },
)

export const fetchFrequencyField = createAsyncThunk(
  'fdtdPostprocessing/fetchFreqField',
  async (request: Parameters<typeof extractFrequencyField>[0]) => {
    return await extractFrequencyField(request)
  },
)

export const fetchSParams = createAsyncThunk(
  'fdtdPostprocessing/fetchSParams',
  async (request: Parameters<typeof computeSParams>[0]) => {
    return await computeSParams(request)
  },
)

// ============================================================================
// Helpers
// ============================================================================

function generateViewName(configs: FdtdViewConfiguration[]): string {
  const n = configs.length + 1
  return `View ${n}`
}

function generateItemLabel(type: FdtdViewItemType, items: FdtdViewItem[]): string {
  const labels: Record<FdtdViewItemType, string> = {
    field_heatmap: 'Field Heatmap',
    time_animation: 'Time Animation',
    radiation_pattern: 'Radiation Pattern',
    s_parameters: 'S-Parameters',
    sar_map: 'SAR Map',
    energy_flow: 'Energy Flow',
    rcs_plot: 'RCS',
    frequency_field: 'Frequency Field',
    probe_time_series: 'Probe Time Series',
  }
  const base = labels[type] || type
  const count = items.filter((i) => i.type === type).length
  return count > 0 ? `${base} ${count + 1}` : base
}

// ============================================================================
// Slice
// ============================================================================

const fdtdPostprocessingSlice = createSlice({
  name: 'fdtdPostprocessing',
  initialState,
  reducers: {
    createView(state, action: PayloadAction<{ name?: string }>) {
      if (state.viewConfigurations.length >= MAX_VIEWS) return
      const now = new Date().toISOString()
      const view: FdtdViewConfiguration = {
        id: uuidv4(),
        name: action.payload.name || generateViewName(state.viewConfigurations),
        items: [],
        createdAt: now,
        updatedAt: now,
      }
      state.viewConfigurations.push(view)
      state.selectedViewId = view.id
      state.selectedItemId = null
    },

    deleteView(state, action: PayloadAction<string>) {
      const idx = state.viewConfigurations.findIndex((v) => v.id === action.payload)
      if (idx === -1) return
      state.viewConfigurations.splice(idx, 1)
      if (state.selectedViewId === action.payload) {
        state.selectedViewId = state.viewConfigurations[Math.max(0, idx - 1)]?.id ?? null
        state.selectedItemId = null
      }
    },

    renameView(state, action: PayloadAction<{ viewId: string; name: string }>) {
      const view = state.viewConfigurations.find((v) => v.id === action.payload.viewId)
      if (view) {
        view.name = action.payload.name
        view.updatedAt = new Date().toISOString()
      }
    },

    selectView(state, action: PayloadAction<string | null>) {
      state.selectedViewId = action.payload
      state.selectedItemId = null
    },

    addItemToView(
      state,
      action: PayloadAction<{
        viewId: string
        type: FdtdViewItemType
        label?: string
        config?: Record<string, unknown>
      }>,
    ) {
      const view = state.viewConfigurations.find((v) => v.id === action.payload.viewId)
      if (!view) return
      const item: FdtdViewItem = {
        id: uuidv4(),
        type: action.payload.type,
        label: action.payload.label || generateItemLabel(action.payload.type, view.items),
        visible: true,
        config: action.payload.config || {},
      }
      view.items.push(item)
      view.updatedAt = new Date().toISOString()
      state.selectedItemId = item.id
    },

    removeItemFromView(state, action: PayloadAction<{ viewId: string; itemId: string }>) {
      const view = state.viewConfigurations.find((v) => v.id === action.payload.viewId)
      if (!view) return
      view.items = view.items.filter((i) => i.id !== action.payload.itemId)
      view.updatedAt = new Date().toISOString()
      if (state.selectedItemId === action.payload.itemId) {
        state.selectedItemId = null
      }
    },

    toggleItemVisibility(state, action: PayloadAction<{ viewId: string; itemId: string }>) {
      const view = state.viewConfigurations.find((v) => v.id === action.payload.viewId)
      if (!view) return
      const item = view.items.find((i) => i.id === action.payload.itemId)
      if (item) {
        item.visible = !item.visible
        view.updatedAt = new Date().toISOString()
      }
    },

    selectItem(state, action: PayloadAction<string | null>) {
      state.selectedItemId = action.payload
    },

    loadViewConfigurations(state, action: PayloadAction<FdtdViewConfiguration[]>) {
      state.viewConfigurations = action.payload
      if (!state.selectedViewId && state.viewConfigurations.length > 0) {
        state.selectedViewId = state.viewConfigurations[0].id
      }
    },

    clearPostprocessing(state) {
      Object.assign(state, initialState)
    },

    setAddViewDialogOpen(state, action: PayloadAction<boolean>) {
      state.addViewDialogOpen = action.payload
    },
  },
  extraReducers: (builder) => {
    // Radiation pattern
    builder
      .addCase(fetchRadiationPattern.pending, (state) => {
        state.computingRadiation = true
        state.computeError = null
      })
      .addCase(fetchRadiationPattern.fulfilled, (state, action) => {
        state.computingRadiation = false
        state.radiationPattern = action.payload
      })
      .addCase(fetchRadiationPattern.rejected, (state, action) => {
        state.computingRadiation = false
        state.computeError = action.error.message ?? 'Radiation pattern failed'
      })
    // SAR
    builder
      .addCase(fetchSar.pending, (state) => {
        state.computingSar = true
        state.computeError = null
      })
      .addCase(fetchSar.fulfilled, (state, action) => {
        state.computingSar = false
        state.sarResult = action.payload
      })
      .addCase(fetchSar.rejected, (state, action) => {
        state.computingSar = false
        state.computeError = action.error.message ?? 'SAR computation failed'
      })
    // RCS
    builder
      .addCase(fetchRcs.pending, (state) => {
        state.computingRcs = true
        state.computeError = null
      })
      .addCase(fetchRcs.fulfilled, (state, action) => {
        state.computingRcs = false
        state.rcsResult = action.payload
      })
      .addCase(fetchRcs.rejected, (state, action) => {
        state.computingRcs = false
        state.computeError = action.error.message ?? 'RCS computation failed'
      })
    // Frequency field
    builder
      .addCase(fetchFrequencyField.pending, (state) => {
        state.computingFreqField = true
        state.computeError = null
      })
      .addCase(fetchFrequencyField.fulfilled, (state, action) => {
        state.computingFreqField = false
        state.frequencyField = action.payload
      })
      .addCase(fetchFrequencyField.rejected, (state, action) => {
        state.computingFreqField = false
        state.computeError = action.error.message ?? 'Frequency field extraction failed'
      })
    // S-parameters
    builder
      .addCase(fetchSParams.pending, (state) => {
        state.computingSParams = true
        state.computeError = null
      })
      .addCase(fetchSParams.fulfilled, (state, action) => {
        state.computingSParams = false
        state.sParams = action.payload
      })
      .addCase(fetchSParams.rejected, (state, action) => {
        state.computingSParams = false
        state.computeError = action.error.message ?? 'S-parameter computation failed'
      })
  },
})

export const {
  createView,
  deleteView,
  renameView,
  selectView,
  addItemToView,
  removeItemFromView,
  toggleItemVisibility,
  selectItem,
  loadViewConfigurations,
  clearPostprocessing,
  setAddViewDialogOpen,
} = fdtdPostprocessingSlice.actions

// Selectors
export const selectFdtdViews = (state: RootState) => state.fdtdPostprocessing.viewConfigurations
export const selectFdtdSelectedViewId = (state: RootState) => state.fdtdPostprocessing.selectedViewId
export const selectFdtdSelectedView = (state: RootState) => {
  const id = state.fdtdPostprocessing.selectedViewId
  if (!id) return null
  return state.fdtdPostprocessing.viewConfigurations.find((v) => v.id === id) ?? null
}
export const selectFdtdSelectedItemId = (state: RootState) => state.fdtdPostprocessing.selectedItemId

export default fdtdPostprocessingSlice.reducer
