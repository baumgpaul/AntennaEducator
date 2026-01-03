/**
 * ExportPDFDialog - Dialog for configuring PDF export options
 * Allows users to choose resolution, include metadata, and set filename
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setExportPDFDialogOpen,
  selectExportPDFDialogOpen,
  selectViewConfigurations,
  selectSelectedViewId,
} from '@/store/postprocessingSlice';
import { selectCurrentFrequency } from '@/store/solverSlice';

type Resolution = '1080p' | '1440p' | '4K';

interface ExportPDFDialogProps {
  projectName?: string;
  onExport: (options: {
    includeMetadata: boolean;
    resolution: Resolution;
    filename: string;
  }) => void;
}

function ExportPDFDialog({ projectName, onExport }: ExportPDFDialogProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectExportPDFDialogOpen);
  const viewConfigurations = useAppSelector(selectViewConfigurations);
  const selectedViewId = useAppSelector(selectSelectedViewId);
  const currentFrequency = useAppSelector(selectCurrentFrequency);
  
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [filename, setFilename] = useState('');

  // Generate default filename from view name
  useEffect(() => {
    if (open && selectedViewId) {
      const currentView = viewConfigurations.find(v => v.id === selectedViewId);
      if (currentView) {
        // Replace spaces and special chars with underscores
        const safeName = currentView.name.replace(/[^a-zA-Z0-9]/g, '_');
        setFilename(safeName);
      }
    }
  }, [open, selectedViewId, viewConfigurations]);

  const handleClose = () => {
    dispatch(setExportPDFDialogOpen(false));
  };

  const handleExport = () => {
    let finalFilename = filename.trim();
    
    // Add .pdf extension if not present
    if (!finalFilename.toLowerCase().endsWith('.pdf')) {
      finalFilename = `${finalFilename}.pdf`;
    } else {
      // Remove .pdf and let onExport handler add it
      finalFilename = finalFilename.slice(0, -4);
    }
    
    onExport({
      includeMetadata,
      resolution,
      filename: finalFilename,
    });
    
    handleClose();
  };

  const currentView = selectedViewId ? viewConfigurations.find(v => v.id === selectedViewId) : null;
  const frequencyMHz = currentFrequency ? (currentFrequency / 1e6).toFixed(2) : 'N/A';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export View to PDF</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Current View Info */}
          {currentView && (
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Exporting: <strong>{currentView.name}</strong> ({currentView.viewType})
              </Typography>
              {projectName && (
                <Typography variant="body2" color="text.secondary">
                  Project: <strong>{projectName}</strong>
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Frequency: <strong>{frequencyMHz} MHz</strong>
              </Typography>
            </Box>
          )}

          {/* Include Metadata */}
          <FormControlLabel
            control={
              <Checkbox
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
              />
            }
            label="Include metadata page (project name, frequency, date)"
          />

          {/* Resolution */}
          <FormControl fullWidth>
            <InputLabel>Resolution</InputLabel>
            <Select
              value={resolution}
              label="Resolution"
              onChange={(e) => setResolution(e.target.value as Resolution)}
            >
              <MenuItem value="1080p">1080p (1920 × 1080)</MenuItem>
              <MenuItem value="1440p">1440p (2560 × 1440)</MenuItem>
              <MenuItem value="4K">4K (3840 × 2160)</MenuItem>
            </Select>
          </FormControl>

          {/* Filename */}
          <TextField
            label="Filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            fullWidth
            required
            helperText=".pdf extension will be added automatically"
            error={!filename.trim()}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={!filename.trim()}
        >
          Export PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExportPDFDialog;
