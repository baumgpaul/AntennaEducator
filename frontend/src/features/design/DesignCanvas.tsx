import { useState } from 'react';
import { Box } from '@mui/material';
import { useAppSelector } from '@/store/hooks';
import { WorkspacePanel } from '@/features/workflow/Workspace';
import { useResizableWidth } from '@/features/workflow/useResizableWidth';
import Scene3D, { type Scene3DHandle, type ViewPreset } from './Scene3D';
import WireGeometry from './WireGeometry';
import ColorLegend from './ColorLegend';
import ColorScaleLegend from './ColorScaleLegend';
import ViewControls from './ViewControls';
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
  bottomPanel?: React.ReactNode;
  showResultsPanel?: boolean;

  // Panel control
  hideRightPanel?: boolean;

  // Display options
  gridVisible?: boolean;
  cameraMode?: 'perspective' | 'orthographic';
  scene3DRef?: React.RefObject<Scene3DHandle>;

  // View control handlers
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleGrid?: () => void;
  onToggleFullscreen?: () => void;
  onViewPreset?: (preset: ViewPreset) => void;
  onToggleCameraMode?: () => void;
  isFullscreen?: boolean;
}

/**
 * DesignCanvas - Main 3D design workspace with resizable panels
 * Layout: [Left Panel] | [3D Canvas] | [Right Panel]
 *         [Bottom Results Panel] (optional)
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
  bottomPanel,
  hideRightPanel = false,
  showResultsPanel = false,
  gridVisible = true,
  cameraMode = 'perspective',
  scene3DRef,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleGrid,
  onViewPreset,
  onToggleCameraMode,
  onToggleFullscreen,
  isFullscreen = false,
}: DesignCanvasProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);

  // Resizable panel widths, kept in the browser
  const left = useResizableWidth('design-left-panel-width', 280, 200);
  const right = useResizableWidth('design-right-panel-width', 320, 250);

  // Get visualization mode from Redux store
  const visualizationMode = useAppSelector((state) => state.ui.visualization.mode);

  // Auto-open right panel when an element is selected (unless doc panel is shown)
  const autoOpenFor = selectedElementId && !hideRightPanel ? selectedElementId : null;
  const [autoOpenedFor, setAutoOpenedFor] = useState(autoOpenFor);
  if (autoOpenFor !== autoOpenedFor) {
    setAutoOpenedFor(autoOpenFor);
    if (autoOpenFor) setRightPanelOpen(true);
  }


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
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        margin: 0,
        padding: 0,
      }}>
        {/* Top section with left panel, canvas, right panel */}
        <div style={{
          display: 'flex',
          flex: showResultsPanel ? '1 1 60%' : 1,
          overflow: 'hidden',
          position: 'relative',
          margin: 0,
          padding: 0,
        }}>
        {/* Left Panel (Tree View) */}
        <WorkspacePanel
          side="left"
          width={left.width}
          open={leftPanelOpen}
          onToggle={() => setLeftPanelOpen((o) => !o)}
          label="Tree View"
          resize={{ min: left.min, max: left.max, onChange: left.setWidth }}
        >
          {leftPanel}
        </WorkspacePanel>

        {/* 3D Canvas */}
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          margin: 0,
          padding: 0,
        }}>
          <Scene3D ref={scene3DRef} elements={elements} mesh={mesh} gridVisible={gridVisible} cameraMode={cameraMode}>
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

          {/* View Controls - Inside 3D viewport */}
          <ViewControls
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetView={onResetView}
            onToggleGrid={onToggleGrid}
            onToggleFullscreen={onToggleFullscreen}
            onViewPreset={onViewPreset}
            onToggleCameraMode={onToggleCameraMode}
            cameraMode={cameraMode}
            gridVisible={gridVisible}
            isFullscreen={isFullscreen}
          />

          {/* Current Distribution Legend - Show only in current-distribution mode */}
          {visualizationMode === 'current-distribution' && currentDistribution && currentDistribution.length > 0 && (
            <ColorScaleLegend
              min={Math.min(...currentDistribution.filter(c => isFinite(c)))}
              max={Math.max(...currentDistribution.filter(c => isFinite(c)))}
              unit="A"
              title="Current Magnitude"
            />
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

        {/* Right Panel (Properties); hidden while the documentation panel takes the space */}
        {!hideRightPanel && (
          <WorkspacePanel
            side="right"
            width={right.width}
            open={rightPanelOpen}
            onToggle={() => setRightPanelOpen((o) => !o)}
            label="Properties"
            resize={{ min: right.min, max: right.max, onChange: right.setWidth }}
          >
            {rightPanel}
          </WorkspacePanel>
        )}
        </div>

        {/* Bottom Results Panel */}
        {showResultsPanel && bottomPanel && (
          <div style={{
            flex: '0 0 40%',
            borderTop: '1px solid rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
            backgroundColor: 'var(--mui-palette-background-paper, #fff)',
          }}>
            {bottomPanel}
          </div>
        )}
      </div>
    </Box>
  );
}

export default DesignCanvas;
