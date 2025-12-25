import { useState } from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import Scene3D from './Scene3D';
import WireGeometry from './WireGeometry';
import type { Mesh } from '@/types/models';

interface DesignCanvasProps {
  mesh?: Mesh;
  currentDistribution?: number[];
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  topToolbar?: React.ReactNode;
}

/**
 * DesignCanvas - Main 3D design workspace with resizable panels
 * Layout: [Left Panel] | [3D Canvas] | [Right Panel]
 */
function DesignCanvas({
  mesh,
  currentDistribution,
  leftPanel,
  rightPanel,
  topToolbar,
}: DesignCanvasProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);

  const leftPanelWidth = 280;
  const rightPanelWidth = 320;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Top Toolbar */}
      {topToolbar && (
        <Paper
          elevation={2}
          sx={{
            p: 1,
            borderRadius: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
            zIndex: 10,
          }}
        >
          {topToolbar}
        </Paper>
      )}

      {/* Main Content Area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left Panel (Tree View) */}
        <Paper
          elevation={3}
          sx={{
            width: leftPanelOpen ? leftPanelWidth : 0,
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 5,
            borderRadius: 0,
          }}
        >
          {leftPanelOpen && (
            <Box sx={{ width: leftPanelWidth, height: '100%', overflow: 'auto' }}>
              {leftPanel}
            </Box>
          )}
        </Paper>

        {/* Left Panel Toggle */}
        <Box
          sx={{
            position: 'absolute',
            left: leftPanelOpen ? leftPanelWidth - 16 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
            transition: 'left 0.3s ease',
          }}
        >
          <Tooltip title={leftPanelOpen ? 'Hide Tree View' : 'Show Tree View'}>
            <IconButton
              size="small"
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {leftPanelOpen ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* 3D Canvas */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            bgcolor: '#1a1a1a',
          }}
        >
          <Scene3D>
            {mesh && (
              <WireGeometry
                mesh={mesh}
                currentDistribution={currentDistribution}
                selected={selectedElement !== null}
                onSelect={() => setSelectedElement(selectedElement === null ? 0 : null)}
              />
            )}
          </Scene3D>

          {/* Center overlay for empty state */}
          {!mesh && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              <Box sx={{ fontSize: '3rem', mb: 2 }}>📡</Box>
              <Box sx={{ fontSize: '1.2rem' }}>No antenna loaded</Box>
              <Box sx={{ fontSize: '0.9rem', mt: 1 }}>
                Create or load an antenna to start designing
              </Box>
            </Box>
          )}
        </Box>

        {/* Right Panel Toggle */}
        <Box
          sx={{
            position: 'absolute',
            right: rightPanelOpen ? rightPanelWidth - 16 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
            transition: 'right 0.3s ease',
          }}
        >
          <Tooltip title={rightPanelOpen ? 'Hide Properties' : 'Show Properties'}>
            <IconButton
              size="small"
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {rightPanelOpen ? <ChevronRight /> : <ChevronLeft />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Right Panel (Properties) */}
        <Paper
          elevation={3}
          sx={{
            width: rightPanelOpen ? rightPanelWidth : 0,
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 5,
            borderRadius: 0,
          }}
        >
          {rightPanelOpen && (
            <Box sx={{ width: rightPanelWidth, height: '100%', overflow: 'auto' }}>
              {rightPanel}
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default DesignCanvas;
