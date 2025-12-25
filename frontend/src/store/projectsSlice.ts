/**
 * Projects state slice
 * Manages project list, current project, and CRUD operations
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Project, Simulation } from '@/types/models'

interface ProjectsState {
  projects: Project[]
  currentProject: Project | null
  simulations: Simulation[]
  loading: boolean
  error: string | null
  selectedProjectId: string | null
}

const initialState: ProjectsState = {
  projects: [],
  currentProject: null,
  simulations: [],
  loading: false,
  error: null,
  selectedProjectId: null,
}

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    // Fetch projects
    fetchProjectsStart: (state) => {
      state.loading = true
      state.error = null
    },
    fetchProjectsSuccess: (state, action: PayloadAction<Project[]>) => {
      state.projects = action.payload
      state.loading = false
      state.error = null
    },
    fetchProjectsFailure: (state, action: PayloadAction<string>) => {
      state.loading = false
      state.error = action.payload
    },
    
    // Create project
    createProjectStart: (state) => {
      state.loading = true
      state.error = null
    },
    createProjectSuccess: (state, action: PayloadAction<Project>) => {
      state.projects.push(action.payload)
      state.currentProject = action.payload
      state.selectedProjectId = action.payload.id
      state.loading = false
      state.error = null
    },
    createProjectFailure: (state, action: PayloadAction<string>) => {
      state.loading = false
      state.error = action.payload
    },
    
    // Update project
    updateProjectStart: (state) => {
      state.loading = true
      state.error = null
    },
    updateProjectSuccess: (state, action: PayloadAction<Project>) => {
      const index = state.projects.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        state.projects[index] = action.payload
      }
      if (state.currentProject?.id === action.payload.id) {
        state.currentProject = action.payload
      }
      state.loading = false
      state.error = null
    },
    updateProjectFailure: (state, action: PayloadAction<string>) => {
      state.loading = false
      state.error = action.payload
    },
    
    // Delete project
    deleteProjectStart: (state) => {
      state.loading = true
      state.error = null
    },
    deleteProjectSuccess: (state, action: PayloadAction<string>) => {
      state.projects = state.projects.filter((p) => p.id !== action.payload)
      if (state.currentProject?.id === action.payload) {
        state.currentProject = null
        state.selectedProjectId = null
      }
      state.loading = false
      state.error = null
    },
    deleteProjectFailure: (state, action: PayloadAction<string>) => {
      state.loading = false
      state.error = action.payload
    },
    
    // Select project
    selectProject: (state, action: PayloadAction<string>) => {
      state.selectedProjectId = action.payload
      state.currentProject = state.projects.find((p) => p.id === action.payload) || null
    },
    
    // Clear current project
    clearCurrentProject: (state) => {
      state.currentProject = null
      state.selectedProjectId = null
      state.simulations = []
    },
    
    // Simulations
    setSimulations: (state, action: PayloadAction<Simulation[]>) => {
      state.simulations = action.payload
    },
    
    addSimulation: (state, action: PayloadAction<Simulation>) => {
      state.simulations.push(action.payload)
    },
    
    updateSimulation: (state, action: PayloadAction<Simulation>) => {
      const index = state.simulations.findIndex((s) => s.id === action.payload.id)
      if (index !== -1) {
        state.simulations[index] = action.payload
      }
    },
    
    // Clear error
    clearProjectsError: (state) => {
      state.error = null
    },
  },
})

export const {
  fetchProjectsStart,
  fetchProjectsSuccess,
  fetchProjectsFailure,
  createProjectStart,
  createProjectSuccess,
  createProjectFailure,
  updateProjectStart,
  updateProjectSuccess,
  updateProjectFailure,
  deleteProjectStart,
  deleteProjectSuccess,
  deleteProjectFailure,
  selectProject,
  clearCurrentProject,
  setSimulations,
  addSimulation,
  updateSimulation,
  clearProjectsError,
} = projectsSlice.actions

export default projectsSlice.reducer
