import { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import GridOnIcon from '@mui/icons-material/GridOn';
import type { SolverWorkflowState } from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import type { AntennaElement } from '@/types/models';

interface PostprocessingTabProps {
  solverState: SolverWorkflowState;
  elements: AntennaElement[];
  requestedFields: FieldDefinition[];
  directivityRequested: boolean;
  fieldResults: Record<string, { computed: boolean; num_points: number }> | null;
}

function PostprocessingTab({
  solverState,
  elements,
  requestedFields,
  directivityRequested,
  fieldResults,
}: PostprocessingTabProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const statusMessage =
    solverState === 'postprocessing-ready'
      ? 'Postprocessing results ready. Visualization coming soon.'
      : 'Solver results available (voltages/currents). Visualization coming soon.';

  const handleSelectItem = (itemId: string) => {
    setSelectedItem(itemId);
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT PANEL - Structure & Solution Outputs */}
      <Box
        sx={{
          width: 280,
          borderRight: 1,
          borderColor: 'divider',
          overflowY: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        {/* Structure Section */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Structure
          </Typography>
        </Box>
        <List disablePadding data-testid="structure-list">
          {elements.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">No antenna loaded</Typography>
            </Box>
          ) : (
            elements.map((el) => (
              <ListItem key={el.id} disablePadding>
                <ListItemButton disabled sx={{ pl: 3, opacity: 0.7 }}>
                  <ListItemText
                    primary={el.name || 'Antenna'}
                    secondary={el.type || 'Element'}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>

        {/* Solution Outputs Section */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            mt: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Solution Outputs
          </Typography>
        </Box>
        <List disablePadding data-testid="outputs-list">
          {/* Currents - Always present */}
          <ListItem disablePadding>
            <ListItemButton
              selected={selectedItem === 'currents'}
              onClick={() => handleSelectItem('currents')}
              sx={{ pl: 3 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CheckCircleIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary="Currents"
                secondary="Branch currents"
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItemButton>
          </ListItem>

          {/* Voltages - Always present */}
          <ListItem disablePadding>
            <ListItemButton
              selected={selectedItem === 'voltages'}
              onClick={() => handleSelectItem('voltages')}
              sx={{ pl: 3 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CheckCircleIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary="Voltages"
                secondary="Node potentials"
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItemButton>
          </ListItem>

          {/* Directivity - If requested */}
          {directivityRequested && (
            <ListItem disablePadding>
              <ListItemButton
                selected={selectedItem === 'directivity'}
                onClick={() => handleSelectItem('directivity')}
                sx={{ pl: 3 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <RadioButtonUncheckedIcon fontSize="small" color="secondary" />
                </ListItemIcon>
                <ListItemText
                  primary="Directivity"
                  secondary="Far-field pattern"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
          )}

          {/* Field Regions */}
          {requestedFields.length === 0 && !directivityRequested && (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">No fields requested</Typography>
            </Box>
          )}
          {requestedFields.map((field, idx) => {
            const isComputed = fieldResults?.[field.id]?.computed ?? false;
            const numPoints = fieldResults?.[field.id]?.num_points;

            return (
              <ListItem key={field.id} disablePadding>
                <ListItemButton
                  selected={selectedItem === field.id}
                  onClick={() => handleSelectItem(field.id)}
                  sx={{ pl: 3 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {isComputed ? (
                      <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                    ) : (
                      <GridOnIcon fontSize="small" color="info" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={field.name || `Field ${idx + 1}`}
                    secondary={`${field.type} ${field.shape}${isComputed ? ` · ${numPoints} pts` : ''}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{
                      variant: 'caption',
                      sx: { color: isComputed ? 'success.main' : 'text.secondary' },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* MIDDLE PANEL - 3D Visualization Placeholder */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
        }}
      >
        <Typography variant="h6" color="text.secondary" textAlign="center">
          {statusMessage}
        </Typography>
      </Box>

      {/* RIGHT PANEL - Properties Panel */}
      <Box
        sx={{
          width: 300,
          borderLeft: 1,
          borderColor: 'divider',
          overflowY: 'auto',
          backgroundColor: 'background.paper',
        }}
      >
        {!selectedItem ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              Select an output to view details
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {selectedItem === 'currents' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Branch Currents
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Computed current distribution on antenna edges.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Visualization controls will be added in Day 5.
                </Typography>
              </>
            )}
            {selectedItem === 'voltages' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Node Voltages
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Computed potential at antenna nodes.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Visualization controls will be added in Day 5.
                </Typography>
              </>
            )}
            {selectedItem === 'directivity' && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Directivity Pattern
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Far-field radiation pattern showing antenna directivity.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  2D polar plots and 3D visualization coming in Day 5.
                </Typography>
              </>
            )}
            {requestedFields.find(f => f.id === selectedItem) && (() => {
              const field = requestedFields.find(f => f.id === selectedItem)!;
              const isComputed = fieldResults?.[field.id]?.computed ?? false;
              const numPoints = fieldResults?.[field.id]?.num_points;
              return (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    {field.name || 'Field Region'}
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Type
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {field.type} Region - {field.shape}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Center
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      ({field.centerPoint[0]}, {field.centerPoint[1]}, {field.centerPoint[2]}) mm
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Status
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {isComputed ? `Computed (${numPoints} points)` : 'Pending computation'}
                    </Typography>
                  </Paper>
                  <Typography variant="caption" color="text.secondary">
                    Field visualization and export coming in Day 5.
                  </Typography>
                </>
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default PostprocessingTab;
