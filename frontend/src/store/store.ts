/**
 * Redux store configuration
 * Central state management for the application
 */

import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import projectsReducer from './projectsSlice'
import designReducer from './designSlice'
import uiReducer from './uiSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    design: designReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['design/setMesh'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.mesh', 'payload.results'],
        // Ignore these paths in the state
        ignoredPaths: ['design.mesh', 'design.results'],
      },
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default store
