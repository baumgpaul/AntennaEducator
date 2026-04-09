/**
 * FEMResultsPanel — Bottom panel for integral quantities, line plots, and probes.
 *
 * Shown below the canvas on the Results tab.
 */

import { useState } from 'react'
import { Box, Tabs, Tab, Divider } from '@mui/material'
import { useAppSelector } from '@/store/hooks'
import { selectFEMSolveResult } from '@/store/femSolverSlice'
import IntegralQuantitiesTable from './IntegralQuantitiesTable'
import FEMLinePlot from './FEMLinePlot'

type ResultsPanelTab = 'integrals' | 'line_plots' | 'probes'

function FEMResultsPanel() {
  const [activeTab, setActiveTab] = useState<ResultsPanelTab>('integrals')
  const result = useAppSelector(selectFEMSolveResult)
  const linePlots = useAppSelector((s) => s.femSolver.linePlots)

  if (!result) return null

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 350, overflow: 'auto' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ minHeight: 32 }}
      >
        <Tab label="Integral Quantities" value="integrals" sx={{ minHeight: 32, py: 0 }} />
        <Tab label="Line Plots" value="line_plots" sx={{ minHeight: 32, py: 0 }} />
        <Tab label="Point Probes" value="probes" sx={{ minHeight: 32, py: 0 }} />
      </Tabs>
      <Divider />

      {activeTab === 'integrals' && <IntegralQuantitiesTable />}

      {activeTab === 'line_plots' && (
        <Box sx={{ p: 1 }}>
          {linePlots.length > 0 ? (
            linePlots.map((lp) => (
              <FEMLinePlot key={lp.id} plotId={lp.id} fieldName={lp.fieldName} />
            ))
          ) : (
            <Box sx={{ p: 2, color: 'text.secondary', fontSize: 14 }}>
              No line plots defined. Add a line plot from the model tree.
            </Box>
          )}
        </Box>
      )}

      {activeTab === 'probes' && (
        <Box sx={{ p: 2, color: 'text.secondary', fontSize: 14 }}>
          Point probes — click on canvas to add probes (coming soon).
        </Box>
      )}
    </Box>
  )
}

export default FEMResultsPanel
