/**
 * FdtdDesignPage — basic render and tab interaction tests
 *
 * Note: Due to known jsdom issues with MUI/React in this project,
 * these tests focus on verifiable render checks.
 */
import { configureStore } from '@reduxjs/toolkit'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import fdtdDesignReducer from '@/store/fdtdDesignSlice'
import fdtdSolverReducer from '@/store/fdtdSolverSlice'
import authReducer from '@/store/authSlice'
import projectsReducer from '@/store/projectsSlice'
import designReducer from '@/store/designSlice'
import uiReducer from '@/store/uiSlice'
import solverReducer from '@/store/solverSlice'
import postprocessingReducer from '@/store/postprocessingSlice'
import documentationReducer from '@/store/documentationSlice'
import foldersReducer from '@/store/foldersSlice'
import FdtdDesignPage from '../FdtdDesignPage'

function createTestStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      projects: projectsReducer,
      design: designReducer,
      ui: uiReducer,
      solver: solverReducer,
      postprocessing: postprocessingReducer,
      documentation: documentationReducer,
      folders: foldersReducer,
      fdtdDesign: fdtdDesignReducer,
      fdtdSolver: fdtdSolverReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  })
}

function renderPage() {
  const store = createTestStore()
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/fdtd/test-project/design']}>
        <Routes>
          <Route path="/fdtd/:projectId/design" element={<FdtdDesignPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('FdtdDesignPage', () => {
  it('renders the page with tabs', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /Design/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Solver/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Post-processing/i })).toBeDefined()
  })

  it('renders FDTD title', () => {
    renderPage()
    expect(screen.getByText(/FDTD Workspace/i)).toBeDefined()
  })

  it('shows design tab content by default', () => {
    renderPage()
    // Design tab shows the tree view with structure categories
    expect(screen.getAllByText(/Structures/i).length).toBeGreaterThan(0)
  })

  it('switches to solver tab on click', () => {
    renderPage()
    const solverTab = screen.getByRole('tab', { name: /Solver/i })
    fireEvent.click(solverTab)
    // Solver tab should show run button
    expect(screen.getByText(/Run FDTD Simulation/i)).toBeDefined()
  })
})
