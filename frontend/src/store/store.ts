/**
 * Redux store configuration
 * Central state management for the application
 */

import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import projectsReducer from './projectsSlice'
import designReducer from './designSlice'
import uiReducer from './uiSlice'
import solverReducer from './solverSlice'
import postprocessingReducer from './postprocessingSlice'
import documentationReducer from './documentationSlice'
import foldersReducer from './foldersSlice'
import variablesReducer from './variablesSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    design: designReducer,
    ui: uiReducer,
    solver: solverReducer,
    postprocessing: postprocessingReducer,
    documentation: documentationReducer,
    folders: foldersReducer,
    variables: variablesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['design/setMesh'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.mesh', 'payload.results', 'payload.branch_currents', 'meta.arg'],
        // Ignore these paths in the state
        ignoredPaths: ['design.mesh', 'design.results', 'solver.results', 'solver.currentDistribution'],
      },
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default store
