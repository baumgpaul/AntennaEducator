/**
 * 2D Polar Plot for Radiation Patterns
 * Renders E-plane, H-plane, or both using Canvas
 */

import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import type { RadiationPatternData } from './RadiationPatternPanel'

interface PolarPlot2DProps {
  patternData: RadiationPatternData
  planeType: 'e-plane' | 'h-plane' | 'both'
  patternType: 'total' | 'theta' | 'phi'
  scaleType: 'linear' | 'db'
  normalize: boolean
  showGrid: boolean
}

const PolarPlot2D: React.FC<PolarPlot2DProps> = ({
  patternData,
  planeType,
  patternType,
  scaleType,
  normalize,
  showGrid,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height)

    // Draw the polar plot
    drawPolarPlot(ctx, rect.width, rect.height)
  }, [patternData, planeType, patternType, scaleType, normalize, showGrid])

  const drawPolarPlot = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 40

    // Draw grid and axes
    if (showGrid) {
      drawPolarGrid(ctx, centerX, centerY, radius)
    }

    // Extract pattern data based on pattern type
    let patternValues: number[] = []
    switch (patternType) {
      case 'total':
        patternValues = patternData.E_total_mag
        break
      case 'theta':
        patternValues = patternData.E_theta_mag
        break
      case 'phi':
        patternValues = patternData.E_phi_mag
        break
    }

    // Convert to dB if needed
    if (scaleType === 'db') {
      patternValues = patternValues.map((v) => 20 * Math.log10(Math.max(v, 1e-10)))
    }

    // Normalize if requested
    if (normalize) {
      const maxVal = Math.max(...patternValues)
      patternValues = patternValues.map((v) => v - maxVal)
    }

    // Draw pattern(s)
    if (planeType === 'both') {
      drawEPlane(ctx, centerX, centerY, radius, patternValues, '#2196F3')
      drawHPlane(ctx, centerX, centerY, radius, patternValues, '#FF5722')
      drawLegend(ctx, width, height)
    } else if (planeType === 'e-plane') {
      drawEPlane(ctx, centerX, centerY, radius, patternValues, '#2196F3')
    } else {
      drawHPlane(ctx, centerX, centerY, radius, patternValues, '#FF5722')
    }

    // Draw scale labels
    drawScaleLabels(ctx, centerX, centerY, radius, scaleType, normalize)
  }

  const drawPolarGrid = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ) => {
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 0.5

    // Concentric circles (dB levels: 0, -10, -20, -30 dB)
    const circles = [1.0, 0.75, 0.5, 0.25]
    circles.forEach((fraction) => {
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * fraction, 0, 2 * Math.PI)
      ctx.stroke()
    })

    // Radial lines (every 30 degrees)
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX + radius * Math.cos(rad - Math.PI / 2), centerY + radius * Math.sin(rad - Math.PI / 2))
      ctx.stroke()
    }

    // Draw angle labels
    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    angles.forEach((angle) => {
      const rad = (angle * Math.PI) / 180
      const labelRadius = radius + 20
      const x = centerX + labelRadius * Math.cos(rad - Math.PI / 2)
      const y = centerY + labelRadius * Math.sin(rad - Math.PI / 2)
      ctx.fillText(`${angle}°`, x, y)
    })
  }

  const drawEPlane = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    patternValues: number[],
    color: string
  ) => {
    // E-plane: φ = 0°, θ varies (vertical plane)
    // For a dipole along Z-axis, this is the XZ plane
    const thetaAngles = patternData.theta_angles
    const phiAngles = patternData.phi_angles

    // Find indices where φ ≈ 0 (E-plane)
    const phiIdx = phiAngles.findIndex((phi) => Math.abs(phi) < 0.1)
    if (phiIdx === -1) return

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    let firstPoint = true
    thetaAngles.forEach((theta, thetaIdx) => {
      const patternIdx = thetaIdx * phiAngles.length + phiIdx
      let value = patternValues[patternIdx]

      // Map dB values to radius (0 dB = full radius, -30 dB = 0)
      if (scaleType === 'db') {
        value = Math.max(value, -30) // Clamp at -30 dB
        value = (value + 30) / 30 // Normalize to [0, 1]
      } else {
        value = Math.max(value, 0)
      }

      const r = radius * value
      const x = centerX + r * Math.sin(theta)
      const y = centerY - r * Math.cos(theta) // Negative because canvas Y is inverted

      if (firstPoint) {
        ctx.moveTo(x, y)
        firstPoint = false
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()
  }

  const drawHPlane = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    patternValues: number[],
    color: string
  ) => {
    // H-plane: θ = 90°, φ varies (horizontal plane)
    // For a dipole along Z-axis, this is the XY plane
    const thetaAngles = patternData.theta_angles
    const phiAngles = patternData.phi_angles

    // Find index where θ ≈ 90° (π/2 radians)
    const thetaIdx = thetaAngles.findIndex((theta) => Math.abs(theta - Math.PI / 2) < 0.1)
    if (thetaIdx === -1) return

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    let firstPoint = true
    phiAngles.forEach((phi, phiIdx) => {
      const patternIdx = thetaIdx * phiAngles.length + phiIdx
      let value = patternValues[patternIdx]

      // Map dB values to radius
      if (scaleType === 'db') {
        value = Math.max(value, -30)
        value = (value + 30) / 30
      } else {
        value = Math.max(value, 0)
      }

      const r = radius * value
      const x = centerX + r * Math.cos(phi)
      const y = centerY + r * Math.sin(phi)

      if (firstPoint) {
        ctx.moveTo(x, y)
        firstPoint = false
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.closePath()
    ctx.stroke()
  }

  const drawScaleLabels = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    scaleType: string,
    _normalize: boolean
  ) => {
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'

    if (scaleType === 'db') {
      const labels = ['0 dB', '-10 dB', '-20 dB', '-30 dB']
      const fractions = [1.0, 0.75, 0.5, 0.25]

      fractions.forEach((fraction, idx) => {
        const y = centerY - radius * fraction
        ctx.fillText(labels[idx], centerX + 5, y)
      })
    }
  }

  const drawLegend = (ctx: CanvasRenderingContext2D, width: number, _height: number) => {
    const legendX = width - 120
    const legendY = 20

    ctx.fillStyle = '#fff'
    ctx.fillRect(legendX - 10, legendY - 10, 110, 50)
    ctx.strokeStyle = '#444'
    ctx.strokeRect(legendX - 10, legendY - 10, 110, 50)

    // E-plane
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(legendX, legendY + 5)
    ctx.lineTo(legendX + 30, legendY + 5)
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('E-plane', legendX + 35, legendY + 10)

    // H-plane
    ctx.strokeStyle = '#FF5722'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(legendX, legendY + 25)
    ctx.lineTo(legendX + 30, legendY + 25)
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.fillText('H-plane', legendX + 35, legendY + 30)
  }

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
        }}
      />
    </Box>
  )
}

export default PolarPlot2D
