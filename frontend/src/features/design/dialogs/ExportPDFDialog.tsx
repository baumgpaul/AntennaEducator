/**
 * ExportPDFDialog - Dialog for configuring structured PDF report export.
 *
 * Lets users choose which sections to include (Cover, Antenna Summary,
 * Solver Config, Views, Documentation) and shows a progress bar while
 * the multi-page PDF is being generated.
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
  Box,
  Typography,
  LinearProgress,
  FormGroup,
  Divider,
  Chip,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setExportPDFDialogOpen,
  selectExportPDFDialogOpen,
  selectViewConfigurations,
} from '@/store/postprocessingSlice';
import type { PDFSections } from '@/utils/pdfReportGenerator';
import type { SubmissionMeta } from '@/utils/pdfDataBuilders';

export interface PDFExportOptions {
  sections: PDFSections;
  filename: string;
  onProgress?: (message: string, current: number, total: number) => void;
}

interface ExportPDFDialogProps {
  projectName?: string;
  /** Author name (logged-in user's display name). */
  authorName?: string;
  /** Submission metadata — shown when exporting from read-only submission viewer. */
  submissionMeta?: SubmissionMeta;
  onExport: (options: PDFExportOptions) => Promise<void>;
}

function ExportPDFDialog({ projectName, authorName, submissionMeta, onExport }: ExportPDFDialogProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectExportPDFDialogOpen);
  const viewConfigurations = useAppSelector(selectViewConfigurations);

  // Section toggles
  const [sections, setSections] = useState<PDFSections>({
    cover: true,
    antennaSummary: true,
    solverConfig: true,
    views: true,
    documentation: true,
  });
  const [filename, setFilename] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSections({ cover: true, antennaSummary: true, solverConfig: true, views: true, documentation: true });
      setIsGenerating(false);
      setProgressMessage('');
      setProgressCurrent(0);
      setProgressTotal(0);
      // Auto-generate filename from project name
      if (projectName) {
        const safe = projectName.replace(/[^a-zA-Z0-9]/g, '_');
        setFilename(safe + '_report');
      } else {
        setFilename('antenna_report');
      }
    }
  }, [open, projectName]);

  const toggleSection = (key: keyof PDFSections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClose = () => {
    if (!isGenerating) dispatch(setExportPDFDialogOpen(false));
  };

  const handleExport = async () => {
    const trimmedFilename = filename.trim();
    if (!trimmedFilename) return;

    setIsGenerating(true);
    setProgressMessage('Preparing…');
    setProgressCurrent(0);
    setProgressTotal(0);

    try {
      await onExport({
        sections,
        filename: trimmedFilename,
        onProgress: (message, current, total) => {
          setProgressMessage(message);
          setProgressCurrent(current);
          setProgressTotal(total);
        },
      });
      dispatch(setExportPDFDialogOpen(false));
    } catch (err) {
      console.error('PDF export failed:', err);
      setProgressMessage(`Error: ${err instanceof Error ? err.message : 'Export failed'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const progressPct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;
  const hasViews = viewConfigurations.length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PictureAsPdfIcon color="error" />
        Export PDF Report
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Project info */}
          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            {projectName && (
              <Typography variant="body2" color="text.secondary">
                Project: <strong>{projectName}</strong>
              </Typography>
            )}
            {authorName && (
              <Typography variant="body2" color="text.secondary">
                Author: <strong>{authorName}</strong>
              </Typography>
            )}
            {submissionMeta && (
              <Chip
                size="small"
                label={`Submission by ${submissionMeta.studentName} — ${submissionMeta.status}`}
                color="warning"
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>

          {/* Section selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Include Sections
            </Typography>
            <FormGroup sx={{ pl: 1 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={sections.cover} onChange={() => toggleSection('cover')} />}
                label="Cover Page (project name, author, date)"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={sections.antennaSummary} onChange={() => toggleSection('antennaSummary')} />}
                label="Antenna Design Summary (elements, variables)"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={sections.solverConfig} onChange={() => toggleSection('solverConfig')} />}
                label="Solver Configuration (frequency, Z₀, method)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={sections.views && hasViews}
                    onChange={() => toggleSection('views')}
                    disabled={!hasViews}
                  />
                }
                label={
                  <span>
                    Result Views — captures each PostprocessingTab view{' '}
                    {hasViews
                      ? <Chip size="small" label={String(viewConfigurations.length)} />
                      : <Chip size="small" label="none" variant="outlined" />}
                  </span>
                }
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={sections.documentation} onChange={() => toggleSection('documentation')} />}
                label="Documentation (project notes/markdown)"
              />
            </FormGroup>
          </Box>

          <Divider />

          {/* Filename */}
          <TextField
            label="Filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            fullWidth
            required
            size="small"
            helperText=".pdf extension added automatically"
            error={!filename.trim() && !isGenerating}
            disabled={isGenerating}
          />

          {/* Progress */}
          {isGenerating && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {progressMessage}
                </Typography>
                {progressTotal > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {progressCurrent}/{progressTotal}
                  </Typography>
                )}
              </Box>
              <LinearProgress
                variant={progressTotal > 0 ? 'determinate' : 'indeterminate'}
                value={progressPct}
              />
            </Box>
          )}

        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isGenerating}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          color="primary"
          disabled={!filename.trim() || isGenerating}
          startIcon={<PictureAsPdfIcon />}
        >
          {isGenerating ? 'Generating…' : 'Export PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExportPDFDialog;
