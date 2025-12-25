/**
 * Projects state slice
 * Manages project list, current project, and CRUD operations
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Project, Simulation } from '@/types/models'
import * as projectsApi from '@/api/projects'
import type { CreateProjectRequest, UpdateProjectRequest } from '@/api/projects'

interface ProjectsState {
  items: Project[]
  currentProject: Project | null
  simulations: Simulation[]
  loading: boolean
  error: string | null
  selectedProjectId: string | null
}

const initialState: ProjectsState = {
  items: [],
  currentProject: null,
  simulations: [],
  loading: false,
  error: null,
  selectedProjectId: null,
}

// Async thunks
export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async () => {
    const projects = await projectsApi.getProjects()
    return projects
  }
)

export const fetchProject = createAsyncThunk(
  'projects/fetchProject',
  async (id: string) => {
    const project = await projectsApi.getProject(id)
    return project
  }
)

export const createProject = createAsyncThunk(
  'projects/createProject',
  async (data: CreateProjectRequest) => {
    const project = await projectsApi.createProject(data)
    return project
  }
)

export const updateProject = createAsyncThunk(
  'projects/updateProject',
  async ({ id, data }: { id: string; data: UpdateProjectRequest }) => {
    const project = await projectsApi.updateProject(id, data)
    return project
  }
)

export const deleteProject = createAsyncThunk(
  'projects/deleteProject',
  async (id: string) => {
    await projectsApi.deleteProject(id)
    return id
  }
)

export const duplicateProject = createAsyncThunk(
  'projects/duplicateProject',
  async (id: string) => {
    const project = await projectsApi.duplicateProject(id)
    return project
  }
)

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    // Select project
    selectProject: (state, action: PayloadAction<string>) => {
      state.selectedProjectId = action.payload
      state.currentProject = state.items.find((p) => p.id === action.payload) || null
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
  extraReducers: (builder) => {
    // Fetch all projects
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch projects'
      })
      
    // Fetch single project
    builder
      .addCase(fetchProject.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.currentProject = action.payload
        state.selectedProjectId = action.payload.id
        state.loading = false
      })
      .addCase(fetchProject.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch project'
      })
      
    // Create project
    builder
      .addCase(createProject.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.items.push(action.payload)
        state.currentProject = action.payload
        state.selectedProjectId = action.payload.id
        state.loading = false
      })
      .addCase(createProject.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to create project'
      })
      
    // Update project
    builder
      .addCase(updateProject.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.items.findIndex((p) => p.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = action.payload
        }
        if (state.currentProject?.id === action.payload.id) {
          state.currentProject = action.payload
        }
        state.loading = false
      })
      .addCase(updateProject.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to update project'
      })
      
    // Delete project
    builder
      .addCase(deleteProject.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.items = state.items.filter((p) => p.id !== action.payload)
        if (state.currentProject?.id === action.payload) {
          state.currentProject = null
          state.selectedProjectId = null
        }
        state.loading = false
      })
      .addCase(deleteProject.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to delete project'
      })
      
    // Duplicate project
    builder
      .addCase(duplicateProject.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(duplicateProject.fulfilled, (state, action) => {
        state.items.push(action.payload)
        state.loading = false
      })
      .addCase(duplicateProject.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to duplicate project'
      })
  },
})

export const {
  selectProject,
  clearCurrentProject,
  setSimulations,
  addSimulation,
  updateSimulation,
  clearProjectsError,
} = projectsSlice.actions

export default projectsSlice.reducer
