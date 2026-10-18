/**
 * Redux store configuration
 * Central state management for the application
 */

import { combineReducers, configureStore, type UnknownAction } from '@reduxjs/toolkit'
import authReducer, { logoutAsync } from './authSlice'
import projectsReducer from './projectsSlice'
import designReducer from './designSlice'
import uiReducer from './uiSlice'
import solverReducer from './solverSlice'
import postprocessingReducer from './postprocessingSlice'
import documentationReducer from './documentationSlice'
import foldersReducer from './foldersSlice'
import variablesReducer from './variablesSlice'
import submissionsReducer from './submissionsSlice'

const appReducer = combineReducers({
  auth: authReducer,
  projects: projectsReducer,
  design: designReducer,
  ui: uiReducer,
  solver: solverReducer,
  postprocessing: postprocessingReducer,
  documentation: documentationReducer,
  folders: foldersReducer,
  variables: variablesReducer,
  submissions: submissionsReducer,
})

/**
 * On logout every slice except the UI preferences (theme, sidebar) goes back
 * to its initial state, so the next user of a shared computer does not see
 * the previous user's projects, designs or results (B18).
 */
export const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: UnknownAction) =>
  appReducer(
    action.type === logoutAsync.fulfilled.type && state ? ({ ui: state.ui } as ReturnType<typeof appReducer>) : state,
    action,
  )

export const store = configureStore({
  reducer: rootReducer,
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
