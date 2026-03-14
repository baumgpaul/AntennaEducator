/**
 * MaterialLibrary — Searchable material browser with categories, fetched
 * from the backend API. Supports browsing library materials and creating
 * custom materials.
 */
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FdtdMaterial } from '@/types/fdtd';
import { fetchMaterials } from '@/api/preprocessorFdtd';

interface MaterialLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (materialKey: string, material: FdtdMaterial) => void;
}

interface MaterialCategory {
  label: string;
  keys: string[];
}

const CATEGORIES: MaterialCategory[] = [
  { label: 'Free Space', keys: ['vacuum', 'air'] },
  { label: 'Metals', keys: ['copper', 'aluminum', 'silver', 'gold', 'pec'] },
  { label: 'PCB', keys: ['fr4', 'rogers_4003c'] },
  { label: 'Dielectrics', keys: ['glass', 'teflon', 'water'] },
  { label: 'Soil', keys: ['dry_soil', 'wet_soil'] },
  { label: 'Biological', keys: ['skin', 'bone', 'brain', 'muscle', 'fat'] },
];

function MaterialLibrary({ open, onClose, onSelect }: MaterialLibraryProps) {
  const [materials, setMaterials] = useState<Record<string, FdtdMaterial>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(0); // 0 = Browse, 1 = Custom
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Custom material form
  const [customName, setCustomName] = useState('');
  const [customEpsilonR, setCustomEpsilonR] = useState(1.0);
  const [customMuR, setCustomMuR] = useState(1.0);
  const [customSigma, setCustomSigma] = useState(0.0);
  const [customColor, setCustomColor] = useState('#808080');

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMaterials();
      setMaterials(data);
    } catch (err) {
      // Fallback: use hardcoded defaults if backend is unreachable
      setError('Could not fetch materials from server. Showing defaults.');
      const defaults: Record<string, FdtdMaterial> = {};
      for (const cat of CATEGORIES) {
        for (const key of cat.keys) {
          defaults[key] = { name: key, epsilon_r: 1.0, mu_r: 1.0, sigma: 0.0, color: '#808080' };
        }
      }
      setMaterials(defaults);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && Object.keys(materials).length === 0) {
      loadMaterials();
    }
  }, [open, loadMaterials, materials]);

  // Filter materials by search term
  const filteredEntries = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return Object.entries(materials).filter(
      ([key, mat]) =>
        key.toLowerCase().includes(lowerSearch) || mat.name.toLowerCase().includes(lowerSearch),
    );
  }, [materials, search]);

  // Group filtered materials by category
  const groupedMaterials = useMemo(() => {
    const filteredKeys = new Set(filteredEntries.map(([k]) => k));
    return CATEGORIES.map((cat) => ({
      ...cat,
      keys: cat.keys.filter((k) => filteredKeys.has(k)),
    })).filter((cat) => cat.keys.length > 0);
  }, [filteredEntries]);

  const selectedMaterial = selectedKey ? materials[selectedKey] : null;

  const handleSelectAndClose = () => {
    if (selectedKey && selectedMaterial && onSelect) {
      onSelect(selectedKey, selectedMaterial);
    }
    onClose();
  };

  const handleCreateCustom = () => {
    if (!customName.trim()) return;
    const key = customName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const mat: FdtdMaterial = {
      name: customName,
      epsilon_r: customEpsilonR,
      mu_r: customMuR,
      sigma: customSigma,
      color: customColor,
    };
    setMaterials((prev) => ({ ...prev, [key]: mat }));
    setSelectedKey(key);
    setActiveTab(0); // Switch to browse
  };

  const handleCopyAsCustom = () => {
    if (!selectedMaterial) return;
    setCustomName(`${selectedMaterial.name} (copy)`);
    setCustomEpsilonR(selectedMaterial.epsilon_r);
    setCustomMuR(selectedMaterial.mu_r);
    setCustomSigma(selectedMaterial.sigma);
    setCustomColor(selectedMaterial.color);
    setActiveTab(1);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Material Library</DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ px: 2, pt: 1 }}>
          <Tab label="Browse Library" />
          <Tab label="Custom Material" icon={<AddIcon />} iconPosition="start" />
        </Tabs>

        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: material list */}
            <Box sx={{ width: 300, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search materials…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {error && (
                <Alert severity="warning" sx={{ mx: 1, mb: 1 }}>
                  {error}
                </Alert>
              )}

              <List dense sx={{ flex: 1, overflow: 'auto' }}>
                {groupedMaterials.map((cat) => (
                  <Box key={cat.label}>
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ px: 2, pt: 1, display: 'block' }}
                    >
                      {cat.label}
                    </Typography>
                    {cat.keys.map((key) => {
                      const mat = materials[key];
                      return (
                        <ListItemButton
                          key={key}
                          selected={selectedKey === key}
                          onClick={() => setSelectedKey(key)}
                        >
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Box
                              sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                bgcolor: mat?.color ?? '#808080',
                                border: '1px solid rgba(0,0,0,0.2)',
                              }}
                            />
                          </ListItemIcon>
                          <ListItemText primary={mat?.name ?? key} />
                        </ListItemButton>
                      );
                    })}
                  </Box>
                ))}
              </List>
            </Box>

            {/* Right: material detail */}
            <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
              {selectedMaterial ? (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: selectedMaterial.color,
                        border: '1px solid rgba(0,0,0,0.2)',
                      }}
                    />
                    <Typography variant="h6">{selectedMaterial.name}</Typography>
                    <Tooltip title="Copy as custom material">
                      <IconButton size="small" onClick={handleCopyAsCustom}>
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Divider />
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      <strong>εᵣ</strong> (relative permittivity): {selectedMaterial.epsilon_r}
                    </Typography>
                    <Typography variant="body2">
                      <strong>μᵣ</strong> (relative permeability): {selectedMaterial.mu_r}
                    </Typography>
                    <Typography variant="body2">
                      <strong>σ</strong> (conductivity):{' '}
                      {selectedMaterial.sigma >= 1e6
                        ? `${(selectedMaterial.sigma / 1e6).toFixed(1)} MS/m`
                        : selectedMaterial.sigma >= 1
                          ? `${selectedMaterial.sigma.toFixed(2)} S/m`
                          : `${selectedMaterial.sigma.toExponential(2)} S/m`}
                    </Typography>
                  </Stack>
                  {selectedMaterial.sigma >= 1e6 && (
                    <Chip label="Good Conductor" size="small" color="warning" variant="outlined" />
                  )}
                  {selectedMaterial.sigma >= 1e10 && (
                    <Chip label="PEC approximation" size="small" color="error" variant="outlined" />
                  )}
                </Stack>
              ) : (
                <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
                  Select a material to view its properties
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box sx={{ p: 2 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Material Name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="εᵣ (relative permittivity)"
                  type="number"
                  value={customEpsilonR}
                  onChange={(e) => setCustomEpsilonR(+e.target.value)}
                  inputProps={{ step: 0.1, min: 1 }}
                  fullWidth
                />
                <TextField
                  label="μᵣ (relative permeability)"
                  type="number"
                  value={customMuR}
                  onChange={(e) => setCustomMuR(+e.target.value)}
                  inputProps={{ step: 0.1, min: 1 }}
                  fullWidth
                />
              </Stack>
              <TextField
                label="σ (conductivity)"
                type="number"
                value={customSigma}
                onChange={(e) => setCustomSigma(+e.target.value)}
                InputProps={{ endAdornment: <InputAdornment position="end">S/m</InputAdornment> }}
                inputProps={{ step: 0.01, min: 0 }}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  label="Color (hex)"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    bgcolor: customColor,
                    border: '1px solid rgba(0,0,0,0.2)',
                  }}
                />
              </Stack>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateCustom}
                disabled={!customName.trim()}
              >
                Add Custom Material
              </Button>
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {onSelect && (
          <Button variant="contained" onClick={handleSelectAndClose} disabled={!selectedKey}>
            Use Material
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default MaterialLibrary;
