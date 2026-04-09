/**
 * AddBCDialog — Dialog for adding a boundary condition.
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
} from '@mui/material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addBoundaryCondition } from '@/store/femDesignSlice'
import type { BCType, BoundaryCondition } from '@/types/femPhysics'

interface AddBCDialogProps {
  open: boolean
  onClose: () => void
}

function AddBCDialog({ open, onClose }: AddBCDialogProps) {
  const dispatch = useAppDispatch()
  const pdeType = useAppSelector((s) => s.femDesign.pdeType)

  const [name, setName] = useState('')
  const [bcType, setBcType] = useState<BCType>('dirichlet')
  const [value, setValue] = useState('0')

  const getBCValueLabel = (): string => {
    if (bcType === 'dirichlet') {
      if (pdeType === 'electrostatic') return 'Potential φ (V)'
      if (pdeType === 'current_flow') return 'Potential φ (V)'
      if (pdeType === 'magnetostatic') return 'Vector potential A_z (Wb/m)'
      return 'Value'
    }
    if (bcType === 'neumann') {
      if (pdeType === 'electrostatic') return 'Normal D-field (C/m²)'
      if (pdeType === 'current_flow') return 'Normal current density (A/m²)'
      return 'Flux'
    }
    return 'Value'
  }

  const handleAdd = () => {
    if (!name.trim()) return

    const bc: BoundaryCondition = {
      id: `bc_${Date.now()}`,
      name: name.trim(),
      type: bcType,
      value: parseFloat(value) || 0,
      edgeIds: [],
    }
    dispatch(addBoundaryCondition(bc))
    onClose()
    setName('')
    setBcType('dirichlet')
    setValue('0')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Boundary Condition</DialogTitle>
      <DialogContent>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          fullWidth
          margin="dense"
          placeholder="e.g., Ground, V_applied, Symmetry"
          autoFocus
        />

        <FormControl fullWidth size="small" margin="dense">
          <InputLabel>Type</InputLabel>
          <Select
            value={bcType}
            label="Type"
            onChange={(e) => setBcType(e.target.value as BCType)}
          >
            <MenuItem value="dirichlet">Dirichlet (fixed value)</MenuItem>
            <MenuItem value="neumann">Neumann (flux)</MenuItem>
            <MenuItem value="robin">Robin (mixed)</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label={getBCValueLabel()}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          size="small"
          type="number"
          fullWidth
          margin="dense"
        />

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          After adding, assign this BC to edges by selecting them in the model tree or canvas.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!name.trim()}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddBCDialog
