import { useParams } from 'react-router-dom';
import { Box, Typography, Paper, Tabs, Tab } from '@mui/material';
import { GridOn as FdtdIcon } from '@mui/icons-material';
import { useState } from 'react';

/**
 * FdtdDesignPage — Stub landing page for FDTD projects.
 * Will be expanded in Phase 1 with geometry editor, solver controls, and post-processing.
 */
function FdtdDesignPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Header */}
      <Paper
        elevation={1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          borderRadius: 0,
        }}
      >
        <FdtdIcon color="secondary" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          FDTD Workspace
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Project {projectId}
        </Typography>
      </Paper>

      {/* Tab bar */}
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Design" />
          <Tab label="Solver" />
          <Tab label="Post-processing" />
        </Tabs>
      </Paper>

      {/* Content placeholder */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: 'center', maxWidth: 480 }}
        >
          <FdtdIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            FDTD Solver — Coming Soon
          </Typography>
          <Typography color="text.secondary">
            {activeTab === 0 && 'Define your simulation domain, materials, sources, and boundary conditions here.'}
            {activeTab === 1 && 'Configure and run FDTD time-stepping simulations.'}
            {activeTab === 2 && 'Visualise E/H fields, compute far-field patterns, and export results.'}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

export default FdtdDesignPage;
