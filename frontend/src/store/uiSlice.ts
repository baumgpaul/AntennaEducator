/**
 * UI state slice
 * Manages global UI state, notifications, modals, and loading states
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Notification } from '@/types/ui'

interface UIState {
  theme: {
    mode: 'light' | 'dark'
  }
  layout: {
    sidebarOpen: boolean
    propertiesPanelOpen: boolean
  }
  notifications: Notification[]
  modals: Record<string, boolean>
}

const initialState: UIState = {
  theme: {
    mode: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  },
  layout: {
    sidebarOpen: true,
    propertiesPanelOpen: true,
  },
  notifications: [],
  modals: {},
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Theme
    toggleTheme: (state) => {
      const newMode = state.theme.mode === 'light' ? 'dark' : 'light'
      state.theme.mode = newMode
      localStorage.setItem('theme', newMode)
    },
    
    // Layout
    toggleSidebar: (state) => {
      state.layout.sidebarOpen = !state.layout.sidebarOpen
    },
    
    togglePropertiesPanel: (state) => {
      state.layout.propertiesPanelOpen = !state.layout.propertiesPanelOpen
    },
    
    // Notifications
    addNotification: (
      state,
      action: PayloadAction<Notification>
    ) => {
      state.notifications.push(action.payload)
    },
    
    removeNotification: (state, action: PayloadAction<number>) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload
      )
    },
    
    clearNotifications: (state) => {
      state.notifications = []
    },
    
    // Modals
    openModal: (
      state,
      action: PayloadAction<{ modalId: string; data?: any }>
    ) => {
      state.modals[action.payload.modalId] = true
    },
    
    closeModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = false
    },
  },
})

export const {
  toggleTheme,
  toggleSidebar,
  togglePropertiesPanel,
  addNotification,
  removeNotification,
  clearNotifications,
  openModal,
  closeModal,
} = uiSlice.actions

// Helper functions for creating notifications
export const showSuccess = (message: string, duration = 5000): PayloadAction<Notification> => {
  return addNotification({ id: Date.now(), message, severity: 'success', duration })
}

export const showError = (message: string, duration = 5000): PayloadAction<Notification> => {
  return addNotification({ id: Date.now(), message, severity: 'error', duration })
}

export const showWarning = (message: string, duration = 5000): PayloadAction<Notification> => {
  return addNotification({ id: Date.now(), message, severity: 'warning', duration })
}

export const showInfo = (message: string, duration = 5000): PayloadAction<Notification> => {
  return addNotification({ id: Date.now(), message, severity: 'info', duration })
}

export default uiSlice.reducer
