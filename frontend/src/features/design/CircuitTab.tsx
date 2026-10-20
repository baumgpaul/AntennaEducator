import { Box, Chip, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import type { AntennaElement } from '@/types/models';
import { CircuitEditor, type CircuitEditorProps } from './circuit/CircuitEditor';

interface Props {
  elements: AntennaElement[];
  selectedElementId: string | null;
  onSelect: (id: string) => void;
  onApply: CircuitEditorProps['onApply'];
  terminalNodeIndices: (element: AntennaElement) => number[];
  readOnly?: boolean;
}

/**
 * Circuit step: pick an antenna, connect sources, loads and ports to its
 * nodes. The editor is the same as before, embedded instead of a dialog.
 */
function CircuitTab({ elements, selectedElementId, onSelect, onApply, terminalNodeIndices, readOnly }: Props) {
  const element = elements.find((e) => e.id === selectedElementId) ?? null;
  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, p: 2 }}>
      <Paper variant="outlined" sx={{ width: 260, overflow: 'auto' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
          Antennas
        </Typography>
        <List dense>
          {elements.map((e) => {
            const n = e.sources?.length ?? 0;
            return (
              <ListItemButton key={e.id} selected={e.id === selectedElementId} onClick={() => onSelect(e.id)}>
                <ListItemText primary={e.name} secondary={e.type} />
                <Chip
                  size="small"
                  variant="outlined"
                  color={n ? 'success' : 'default'}
                  label={n ? `${n} source${n > 1 ? 's' : ''}` : 'no source'}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Paper>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {element ? (
          <CircuitEditor
            variant="inline"
            open
            onClose={() => undefined}
            onApply={onApply}
            element={element}
            terminalNodeIndices={terminalNodeIndices(element)}
            readOnly={readOnly}
          />
        ) : (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Select an antenna on the left to connect sources, loads and ports to it.
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default CircuitTab;
