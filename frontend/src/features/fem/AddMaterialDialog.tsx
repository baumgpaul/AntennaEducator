/**
 * AddMaterialDialog — Dialog for adding a material from library or custom.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Divider,
  Box,
} from '@mui/material'
import { useAppDispatch } from '@/store/hooks'
import { addMaterial } from '@/store/femDesignSlice'
import { BUILTIN_MATERIALS } from '@/types/femPhysics'
import type { Material } from '@/types/femPhysics'

interface AddMaterialDialogProps {
  open: boolean
  onClose: () => void
}

function AddMaterialDialog({ open, onClose }: AddMaterialDialogProps) {
  const dispatch = useAppDispatch()
  const [libraryId, setLibraryId] = useState('')
  const [customName, setCustomName] = useState('')
  const [customEpsilonR, setCustomEpsilonR] = useState('1.0')
  const [customSigma, setCustomSigma] = useState('')
  const [mode, setMode] = useState<'library' | 'custom'>('library')

  const handleAddFromLibrary = () => {
    const lib = BUILTIN_MATERIALS.find((m) => m.id === libraryId)
    if (!lib) return

    const mat: Material = {
      id: `${lib.id}_${Date.now()}`,
      name: lib.name,
      properties: [...lib.properties],
    }
    dispatch(addMaterial(mat))
    onClose()
    resetForm()
  }

  const handleAddCustom = () => {
    if (!customName.trim()) return
    const props = [
      { name: 'epsilon_r', value: parseFloat(customEpsilonR) || 1.0, unit: '' },
    ]
    if (customSigma.trim()) {
      props.push({ name: 'sigma', value: parseFloat(customSigma), unit: 'S/m' })
    }

    const mat: Material = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      properties: props,
    }
    dispatch(addMaterial(mat))
    onClose()
    resetForm()
  }

  const resetForm = () => {
    setLibraryId('')
    setCustomName('')
    setCustomEpsilonR('1.0')
    setCustomSigma('')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Material</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
          <Button
            variant={mode === 'library' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setMode('library')}
          >
            Library
          </Button>
          <Button
            variant={mode === 'custom' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setMode('custom')}
          >
            Custom
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {mode === 'library' && (
          <FormControl fullWidth size="small">
            <InputLabel>Material</InputLabel>
            <Select
              value={libraryId}
              label="Material"
              onChange={(e) => setLibraryId(e.target.value)}
            >
              {BUILTIN_MATERIALS.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name} ({m.category})
                </MenuItem>
              ))}
            </Select>
            {libraryId && (
              <Typography variant="caption" sx={{ mt: 1 }}>
                {BUILTIN_MATERIALS.find((m) => m.id === libraryId)
                  ?.properties.map((p) => `${p.name} = ${p.value} ${p.unit}`)
                  .join(', ')}
              </Typography>
            )}
          </FormControl>
        )}

        {mode === 'custom' && (
          <>
            <TextField
              label="Name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              size="small"
              fullWidth
              margin="dense"
            />
            <TextField
              label="Relative permittivity (ε_r)"
              value={customEpsilonR}
              onChange={(e) => setCustomEpsilonR(e.target.value)}
              size="small"
              type="number"
              fullWidth
              margin="dense"
            />
            <TextField
              label="Conductivity σ (S/m, optional)"
              value={customSigma}
              onChange={(e) => setCustomSigma(e.target.value)}
              size="small"
              type="number"
              fullWidth
              margin="dense"
              helperText="Leave empty for dielectric materials"
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={mode === 'library' ? handleAddFromLibrary : handleAddCustom}
          disabled={mode === 'library' ? !libraryId : !customName.trim()}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddMaterialDialog
