/**
 * Radiation Pattern Visualization Panel
 * Displays 2D polar plots and 3D radiation patterns
 */

import React, { useState } from 'react'
import {
  Card,
  CardContent,
  Tabs,
  Tab,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import PolarPlot2D from './PolarPlot2D'
import Pattern3D from './Pattern3D'

export interface RadiationPatternData {
  frequency: number
  theta_angles: number[] // radians
  phi_angles: number[] // radians
  E_theta_mag: number[]
  E_phi_mag: number[]
  E_total_mag: number[]
  pattern_db: number[] // dB values
  directivity: number // dBi
  gain: number // dBi
  efficiency: number
  beamwidth_theta?: number // degrees
  beamwidth_phi?: number // degrees
  max_direction: [number, number] // [theta, phi] in radians
}

interface RadiationPatternPanelProps {
  patternData: RadiationPatternData | null
  isLoading?: boolean
}

type TabValue = '2d' | '3d'
type PlaneType = 'e-plane' | 'h-plane' | 'both'
type PatternType = 'total' | 'theta' | 'phi'
type ScaleType = 'linear' | 'db'

const RadiationPatternPanel: React.FC<RadiationPatternPanelProps> = ({
  patternData,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabValue>('2d')
  const [planeType, setPlaneType] = useState<PlaneType>('both')
  const [patternType, setPatternType] = useState<PatternType>('total')
  const [scaleType, setScaleType] = useState<ScaleType>('db')
  const [normalize, setNormalize] = useState(true)
  const [showGrid, setShowGrid] = useState(true)

  const handleTabChange = (_event: React.SyntheticEvent, newValue: TabValue) => {
    setActiveTab(newValue)
  }

  const handlePlaneChange = (event: SelectChangeEvent<PlaneType>) => {
    setPlaneType(event.target.value as PlaneType)
  }

  const handlePatternTypeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newType: PatternType | null
  ) => {
    if (newType !== null) {
      setPatternType(newType)
    }
  }

  const handleScaleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newScale: ScaleType | null
  ) => {
    if (newScale !== null) {
      setScaleType(newScale)
    }
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Radiation Pattern</Typography>
          {patternData && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Directivity: <strong>{patternData.directivity.toFixed(2)} dBi</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gain: <strong>{patternData.gain.toFixed(2)} dBi</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Efficiency: <strong>{(patternData.efficiency * 100).toFixed(1)}%</strong>
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Tabs */}
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="2D Polar Plot" value="2d" />
          <Tab label="3D Pattern" value="3d" />
        </Tabs>

        {/* Controls */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          {/* Plane selector (for 2D only) */}
          {activeTab === '2d' && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Plane</InputLabel>
              <Select value={planeType} onChange={handlePlaneChange} label="Plane">
                <MenuItem value="e-plane">E-plane (φ=0°)</MenuItem>
                <MenuItem value="h-plane">H-plane (θ=90°)</MenuItem>
                <MenuItem value="both">Both Planes</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Pattern type selector */}
          <ToggleButtonGroup
            value={patternType}
            exclusive
            onChange={handlePatternTypeChange}
            size="small"
            aria-label="pattern type"
          >
            <ToggleButton value="total" aria-label="total field">
              |E| Total
            </ToggleButton>
            <ToggleButton value="theta" aria-label="theta component">
              E<sub>θ</sub>
            </ToggleButton>
            <ToggleButton value="phi" aria-label="phi component">
              E<sub>φ</sub>
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Scale selector */}
          <ToggleButtonGroup
            value={scaleType}
            exclusive
            onChange={handleScaleChange}
            size="small"
            aria-label="scale type"
          >
            <ToggleButton value="db" aria-label="decibel scale">
              dB
            </ToggleButton>
            <ToggleButton value="linear" aria-label="linear scale">
              Linear
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Options */}
          <FormControlLabel
            control={<Switch checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />}
            label="Normalize"
          />
          <FormControlLabel
            control={<Switch checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />}
            label="Grid"
          />
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
          {!patternData && !isLoading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary',
              }}
            >
              <Typography variant="body2">
                Run simulation to view radiation pattern
              </Typography>
            </Box>
          )}

          {isLoading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <Typography variant="body2">Computing radiation pattern...</Typography>
            </Box>
          )}

          {patternData && !isLoading && (
            <>
              {activeTab === '2d' && (
                <PolarPlot2D
                  patternData={patternData}
                  planeType={planeType}
                  patternType={patternType}
                  scaleType={scaleType}
                  normalize={normalize}
                  showGrid={showGrid}
                />
              )}
              {activeTab === '3d' && (
                <Pattern3D
                  patternData={patternData}
                  patternType={patternType}
                  scaleType={scaleType}
                  normalize={normalize}
                />
              )}
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

export default RadiationPatternPanel
