/**
 * BooleanDialog — Modal dialog for applying boolean operations on surfaces.
 *
 * Allows user to pick:
 *  - Operation type (union / subtract / intersect)
 *  - Object surface (the base shape)
 *  - Tool surface (the shape applied to the object)
 *  - Keep tool option
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
} from '@mui/material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  addGeometryOperation,
  setActiveTool,
  selectFEMEvaluatedGeometry,
} from '@/store/femDesignSlice'

type BooleanOpType = 'boolean_union' | 'boolean_subtract' | 'boolean_intersect'

interface BooleanDialogProps {
  open: boolean
  onClose: () => void
  preselectedSurface?: string | null
}

function BooleanDialog({ open, onClose, preselectedSurface }: BooleanDialogProps) {
  const dispatch = useAppDispatch()
  const evaluatedGeometry = useAppSelector(selectFEMEvaluatedGeometry)
  const surfaces = useMemo(() => evaluatedGeometry?.surfaces ?? [], [evaluatedGeometry])

  const [opType, setOpType] = useState<BooleanOpType>('boolean_subtract')
  const [objectTag, setObjectTag] = useState('')
  const [toolTag, setToolTag] = useState('')
  const [keepTool, setKeepTool] = useState(false)

  // Pre-fill when dialog opens with a preselected surface
  useEffect(() => {
    if (open) {
      if (preselectedSurface && surfaces.length >= 2) {
        // Preselected becomes tool; pick another as object
        setToolTag(preselectedSurface)
        const other = surfaces.find((s) => s.id !== preselectedSurface)
        setObjectTag(other?.id ?? '')
      } else if (surfaces.length >= 2) {
        setObjectTag(surfaces[0].id)
        setToolTag(surfaces[1].id)
      } else {
        setObjectTag(surfaces[0]?.id ?? '')
        setToolTag('')
      }
    }
  }, [open, preselectedSurface, surfaces])

  const canApply =
    objectTag !== '' && toolTag !== '' && objectTag !== toolTag && surfaces.length >= 2

  const handleApply = () => {
    if (!canApply) return
    const tag = `${opType.replace('boolean_', '')}_${Date.now()}`
    dispatch(
      addGeometryOperation({
        type: opType,
        params: { tag, object_tag: objectTag, tool_tag: toolTag, remove_tool: !keepTool },
      }),
    )
    dispatch(setActiveTool('select'))
    onClose()
  }

  const opLabel =
    opType === 'boolean_union'
      ? 'Union: merge both surfaces into one'
      : opType === 'boolean_subtract'
        ? 'Subtract: cut tool shape out of object'
        : 'Intersect: keep only the overlapping region'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Boolean Operation</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Operation type */}
          <FormControl fullWidth size="small">
            <InputLabel>Operation</InputLabel>
            <Select
              value={opType}
              label="Operation"
              onChange={(e) => setOpType(e.target.value as BooleanOpType)}
            >
              <MenuItem value="boolean_union">Union</MenuItem>
              <MenuItem value="boolean_subtract">Subtract</MenuItem>
              <MenuItem value="boolean_intersect">Intersect</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            {opLabel}
          </Typography>

          {/* Object surface */}
          <FormControl fullWidth size="small">
            <InputLabel>Object (base shape)</InputLabel>
            <Select
              value={objectTag}
              label="Object (base shape)"
              onChange={(e) => setObjectTag(e.target.value)}
            >
              {surfaces
                .filter((s) => s.id !== toolTag)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          {/* Tool surface */}
          <FormControl fullWidth size="small">
            <InputLabel>Tool (applied shape)</InputLabel>
            <Select
              value={toolTag}
              label="Tool (applied shape)"
              onChange={(e) => setToolTag(e.target.value)}
            >
              {surfaces
                .filter((s) => s.id !== objectTag)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          {/* Keep tool */}
          <FormControlLabel
            control={
              <Checkbox
                checked={keepTool}
                onChange={(e) => setKeepTool(e.target.checked)}
                size="small"
              />
            }
            label="Keep tool surface after operation"
          />

          {surfaces.length < 2 && (
            <Typography variant="body2" color="error">
              At least 2 surfaces are required for boolean operations.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="contained" disabled={!canApply}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default BooleanDialog
