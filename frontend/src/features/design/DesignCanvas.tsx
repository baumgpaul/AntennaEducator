import { useState, useEffect } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useAppSelector } from '@/store/hooks';
import Scene3D from './Scene3D';
import WireGeometry from './WireGeometry';
import ColorLegend from './ColorLegend';
import type { Mesh, AntennaElement } from '@/types/models';

interface DesignCanvasProps {
  // Multi-element support
  elements?: AntennaElement[];
  selectedElementId?: string | null;
  onElementSelect?: (elementId: string) => void;
  
  // Single mesh support (backward compatibility)
  mesh?: Mesh;
  currentDistribution?: number[];
  
  // Panel content
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  topToolbar?: React.ReactNode;
}

/**
 * DesignCanvas - Main 3D design workspace with resizable panels
 * Layout: [Left Panel] | [3D Canvas] | [Right Panel]
 */
function DesignCanvas({
  elements,
  selectedElementId,
  onElementSelect,
  mesh,
  currentDistribution,
  leftPanel,
  rightPanel,
  topToolbar,
}: DesignCanvasProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  
  // Get visualization mode from Redux store
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);

  // Auto-open right panel when an element is selected
  useEffect(() => {
    if (selectedElementId) {
      setRightPanelOpen(true);
    }
  }, [selectedElementId]);

  const leftPanelWidth = 280;
  const rightPanelWidth = 320;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Top Toolbar */}
      {topToolbar && (
        <Box
          sx={{
            p: 1,
            borderRadius: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
            zIndex: 10,
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
          {topToolbar}
        </Box>
      )}

      {/* Main Content Area - Pure Flexbox with plain divs */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative',
        margin: 0,
        padding: 0,
      }}>
        {/* Left Panel (Tree View) */}
        {leftPanelOpen && (
          <div style={{
            width: `${leftPanelWidth}px`,
            flexShrink: 0,
            position: 'relative',
            overflow: 'auto',
            backgroundColor: 'var(--mui-palette-background-paper, #fff)',
            borderRight: '1px solid rgba(0, 0, 0, 0.12)',
            margin: 0,
            padding: 0,
          }}>
            {leftPanel}
            
            {/* Left Panel Toggle */}
            <div style={{
              position: 'absolute',
              right: '-20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
            }}>
              <Tooltip title="Hide Tree View" placement="right">
                <IconButton
                  size="small"
                  onClick={() => setLeftPanelOpen(false)}
                  sx={{
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <ChevronLeft />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Left Panel Toggle when closed */}
        {!leftPanelOpen && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
          }}>
            <Tooltip title="Show Tree View" placement="right">
              <IconButton
                size="small"
                onClick={() => setLeftPanelOpen(true)}
                sx={{
                  bgcolor: 'background.paper',
                  boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ChevronRight />
              </IconButton>
            </Tooltip>
          </div>
        )}

        {/* 3D Canvas */}
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          margin: 0,
          padding: 0,
        }}>
          <Scene3D elements={elements} mesh={mesh}>
            {(elements && elements.length > 0) || mesh ? (
              <WireGeometry
                elements={elements}
                selectedElementId={selectedElementId}
                onElementSelect={onElementSelect}
                mesh={mesh}
                currentDistribution={currentDistribution}
                selected={selectedElement !== null}
                onSelect={() => setSelectedElement(selectedElement === null ? 0 : null)}
                showNodes={true} // Show source and load connection points
                visualizationMode={visualizationMode}
              />
            ) : null}
          </Scene3D>

          {/* Color Legend - Show only in element-colors mode */}
          {visualizationMode === 'element-colors' && (
            <ColorLegend elements={elements} visible={true} />
          )}

          {/* Center overlay for empty state */}
          {!elements?.length && !mesh && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.5)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📡</div>
              <div style={{ fontSize: '1.2rem' }}>No antenna loaded</div>
              <div style={{ fontSize: '0.9rem', marginTop: '8px' }}>
                Create or load an antenna to start designing
              </div>
            </div>
          )}
        </div>

        {/* Right Panel (Properties) */}
        {rightPanelOpen && (
          <div style={{
            width: `${rightPanelWidth}px`,
            flexShrink: 0,
            position: 'relative',
            overflow: 'auto',
            backgroundColor: 'var(--mui-palette-background-paper, #fff)',
            borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
            margin: 0,
            padding: 0,
          }}>
            {rightPanel}
            
            {/* Right Panel Toggle */}
            <div style={{
              position: 'absolute',
              left: '-20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
            }}>
              <Tooltip title="Hide Properties" placement="left">
                <IconButton
                  size="small"
                  onClick={() => setRightPanelOpen(false)}
                  sx={{
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <ChevronRight />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Right Panel Toggle when closed */}
        {!rightPanelOpen && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
          }}>
            <Tooltip title="Show Properties" placement="left">
              <IconButton
                size="small"
                onClick={() => setRightPanelOpen(true)}
                sx={{
                  bgcolor: 'background.paper',
                  boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ChevronLeft />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </div>
    </Box>
  );
}

export default DesignCanvas;
