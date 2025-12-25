/**
 * UI state slice
 * Manages global UI state, notifications, modals, and loading states
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Notification } from '@/types/ui'

interface UIState {
  // Layout
  sidebarOpen: boolean
  propertiesPanelOpen: boolean
  
  // Theme
  theme: 'light' | 'dark'
  
  // Notifications
  notifications: Notification[]
  
  // Modals
  activeModal: string | null
  modalData: any
  
  // Global loading
  globalLoading: boolean
  globalLoadingMessage: string | null
  
  // Navigation
  currentPage: string
  breadcrumbs: { label: string; path?: string }[]
}

const initialState: UIState = {
  sidebarOpen: true,
  propertiesPanelOpen: true,
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  notifications: [],
  activeModal: null,
  modalData: null,
  globalLoading: false,
  globalLoadingMessage: null,
  currentPage: '/',
  breadcrumbs: [],
}

let notificationIdCounter = 0

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Layout
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen
    },
    
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload
    },
    
    togglePropertiesPanel: (state) => {
      state.propertiesPanelOpen = !state.propertiesPanelOpen
    },
    
    setPropertiesPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.propertiesPanelOpen = action.payload
    },
    
    // Theme
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
      localStorage.setItem('theme', action.payload)
    },
    
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', state.theme)
    },
    
    // Notifications
    addNotification: (
      state,
      action: PayloadAction<Omit<Notification, 'id'>>
    ) => {
      const notification: Notification = {
        ...action.payload,
        id: `notification-${notificationIdCounter++}`,
      }
      state.notifications.push(notification)
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload
      )
    },
    
    clearNotifications: (state) => {
      state.notifications = []
    },
    
    // Helper actions for common notification types
    showSuccess: (state, action: PayloadAction<string>) => {
      state.notifications.push({
        id: `notification-${notificationIdCounter++}`,
        type: 'success',
        message: action.payload,
        duration: 3000,
      })
    },
    
    showError: (state, action: PayloadAction<string>) => {
      state.notifications.push({
        id: `notification-${notificationIdCounter++}`,
        type: 'error',
        message: action.payload,
        duration: 5000,
      })
    },
    
    showWarning: (state, action: PayloadAction<string>) => {
      state.notifications.push({
        id: `notification-${notificationIdCounter++}`,
        type: 'warning',
        message: action.payload,
        duration: 4000,
      })
    },
    
    showInfo: (state, action: PayloadAction<string>) => {
      state.notifications.push({
        id: `notification-${notificationIdCounter++}`,
        type: 'info',
        message: action.payload,
        duration: 3000,
      })
    },
    
    // Modals
    openModal: (
      state,
      action: PayloadAction<{ modalId: string; data?: any }>
    ) => {
      state.activeModal = action.payload.modalId
      state.modalData = action.payload.data
    },
    
    closeModal: (state) => {
      state.activeModal = null
      state.modalData = null
    },
    
    // Global loading
    setGlobalLoading: (
      state,
      action: PayloadAction<{ loading: boolean; message?: string }>
    ) => {
      state.globalLoading = action.payload.loading
      state.globalLoadingMessage = action.payload.message || null
    },
    
    // Navigation
    setCurrentPage: (state, action: PayloadAction<string>) => {
      state.currentPage = action.payload
    },
    
    setBreadcrumbs: (
      state,
      action: PayloadAction<{ label: string; path?: string }[]>
    ) => {
      state.breadcrumbs = action.payload
    },
  },
})

export const {
  toggleSidebar,
  setSidebarOpen,
  togglePropertiesPanel,
  setPropertiesPanelOpen,
  setTheme,
  toggleTheme,
  addNotification,
  removeNotification,
  clearNotifications,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  openModal,
  closeModal,
  setGlobalLoading,
  setCurrentPage,
  setBreadcrumbs,
} = uiSlice.actions

export default uiSlice.reducer
