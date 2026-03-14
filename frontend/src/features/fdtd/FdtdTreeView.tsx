/**
 * FdtdTreeView — Left sidebar tree showing the FDTD domain hierarchy:
 *   Domain → Structures, Sources, Probes, Boundaries
 *
 * Mirrors the PEEC TreeViewPanel pattern with collapsible categories,
 * item selection, and delete actions.
 */
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  ViewInAr as StructureIcon,
  FlashOn as SourceIcon,
  GpsFixed as ProbeIcon,
  BorderAll as BoundaryIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { removeStructure, removeSource, removeProbe } from '@/store/fdtdDesignSlice';

export type FdtdTreeCategory = 'structure' | 'source' | 'probe' | 'boundary';

interface FdtdTreeViewProps {
  onSelect: (id: string, category: FdtdTreeCategory) => void;
  selectedId: string | null;
}

function FdtdTreeView({ onSelect, selectedId }: FdtdTreeViewProps) {
  const dispatch = useAppDispatch();
  const { structures, sources, probes, boundaries, dimensionality, domainSize } = useAppSelector(
    (s) => s.fdtdDesign,
  );

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    structures: true,
    sources: true,
    probes: true,
    boundaries: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDomainLabel = () => {
    if (dimensionality === '1d') {
      return `Domain (${(domainSize[0] * 1000).toFixed(0)} mm, ${dimensionality.toUpperCase()})`;
    }
    return `Domain (${(domainSize[0] * 1000).toFixed(0)}×${(domainSize[1] * 1000).toFixed(0)} mm, ${dimensionality.toUpperCase()})`;
  };

  const bcSummary = (face: string, bc: { type: string }) => `${face}: ${bc.type.toUpperCase()}`;

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        bgcolor: 'background.paper',
      }}
    >
      {/* Domain header */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" color="text.secondary">
          {formatDomainLabel()}
        </Typography>
      </Box>

      <List dense disablePadding>
        {/* ── Structures ── */}
        <ListItemButton onClick={() => toggleSection('structures')}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <StructureIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Structures"
            secondary={`${structures.length} item${structures.length !== 1 ? 's' : ''}`}
          />
          {expandedSections.structures ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={expandedSections.structures}>
          <List dense disablePadding>
            {structures.map((s) => (
              <ListItemButton
                key={s.id}
                selected={selectedId === s.id}
                onClick={() => onSelect(s.id, 'structure')}
                sx={{ pl: 4 }}
              >
                <ListItemText
                  primary={s.name}
                  secondary={
                    <Chip label={s.material} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                  }
                />
                <IconButton
                  size="small"
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(removeStructure(s.id));
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
            {structures.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 4, py: 0.5, display: 'block' }}>
                No structures
              </Typography>
            )}
          </List>
        </Collapse>

        {/* ── Sources ── */}
        <ListItemButton onClick={() => toggleSection('sources')}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <SourceIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Sources"
            secondary={`${sources.length} item${sources.length !== 1 ? 's' : ''}`}
          />
          {expandedSections.sources ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={expandedSections.sources}>
          <List dense disablePadding>
            {sources.map((src) => (
              <ListItemButton
                key={src.id}
                selected={selectedId === src.id}
                onClick={() => onSelect(src.id, 'source')}
                sx={{ pl: 4 }}
              >
                <ListItemText
                  primary={src.name}
                  secondary={src.type.replace(/_/g, ' ')}
                />
                <IconButton
                  size="small"
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(removeSource(src.id));
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
            {sources.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 4, py: 0.5, display: 'block' }}>
                No sources
              </Typography>
            )}
          </List>
        </Collapse>

        {/* ── Probes ── */}
        <ListItemButton onClick={() => toggleSection('probes')}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <ProbeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Probes"
            secondary={`${probes.length} item${probes.length !== 1 ? 's' : ''}`}
          />
          {expandedSections.probes ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={expandedSections.probes}>
          <List dense disablePadding>
            {probes.map((p) => (
              <ListItemButton
                key={p.id}
                selected={selectedId === p.id}
                onClick={() => onSelect(p.id, 'probe')}
                sx={{ pl: 4 }}
              >
                <ListItemText primary={p.name} secondary={`${p.type} — ${p.fields.join(', ')}`} />
                <IconButton
                  size="small"
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(removeProbe(p.id));
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
            {probes.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 4, py: 0.5, display: 'block' }}>
                No probes
              </Typography>
            )}
          </List>
        </Collapse>

        {/* ── Boundaries ── */}
        <ListItemButton onClick={() => toggleSection('boundaries')}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <BoundaryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Boundaries"
            secondary={boundaries.x_min.type.toUpperCase()}
          />
          {expandedSections.boundaries ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={expandedSections.boundaries}>
          <Box sx={{ pl: 4, pr: 1, py: 0.5 }}>
            {dimensionality === '1d' ? (
              <>
                <Typography variant="caption" display="block">
                  {bcSummary('x_min', boundaries.x_min)}
                </Typography>
                <Typography variant="caption" display="block">
                  {bcSummary('x_max', boundaries.x_max)}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="caption" display="block">
                  {bcSummary('x_min', boundaries.x_min)} / {bcSummary('x_max', boundaries.x_max)}
                </Typography>
                <Typography variant="caption" display="block">
                  {bcSummary('y_min', boundaries.y_min)} / {bcSummary('y_max', boundaries.y_max)}
                </Typography>
              </>
            )}
          </Box>
        </Collapse>
      </List>
    </Box>
  );
}

export default FdtdTreeView;
