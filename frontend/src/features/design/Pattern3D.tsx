/**
 * 3D Radiation Pattern Visualization
 * Renders radiation pattern as a 3D surface using React Three Fiber
 */

import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { RadiationPatternData } from './RadiationPatternPanel'

interface Pattern3DProps {
  patternData: RadiationPatternData
  patternType: 'total' | 'theta' | 'phi'
  scaleType: 'linear' | 'db'
  normalize: boolean
}

interface PatternMeshProps {
  patternData: RadiationPatternData
  patternType: 'total' | 'theta' | 'phi'
  scaleType: 'linear' | 'db'
  normalize: boolean
}

const PatternMesh: React.FC<PatternMeshProps> = ({
  patternData,
  patternType,
  scaleType,
  normalize,
}) => {
  const { geometry, colors } = useMemo(() => {
    // Extract pattern values based on type
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
    let maxVal = Math.max(...patternValues)
    let minVal = Math.min(...patternValues)

    if (normalize) {
      patternValues = patternValues.map((v) => v - maxVal)
      minVal = minVal - maxVal
      maxVal = 0
    }

    const thetaAngles = patternData.theta_angles
    const phiAngles = patternData.phi_angles
    const nTheta = thetaAngles.length
    const nPhi = phiAngles.length

    // Create geometry
    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const indices: number[] = []
    const colors: number[] = []

    // Create color map (blue -> green -> red)
    const getColor = (value: number) => {
      const normalized = (value - minVal) / (maxVal - minVal || 1)
      const color = new THREE.Color()

      if (normalized < 0.5) {
        // Blue to Green
        color.setRGB(0, normalized * 2, 1 - normalized * 2)
      } else {
        // Green to Red
        color.setRGB((normalized - 0.5) * 2, 1 - (normalized - 0.5) * 2, 0)
      }

      return color
    }

    // Generate vertices
    thetaAngles.forEach((theta, thetaIdx) => {
      phiAngles.forEach((phi, phiIdx) => {
        const patternIdx = thetaIdx * nPhi + phiIdx
        let value = patternValues[patternIdx]

        // Map to radius (normalize for dB: 0 dB = 1.0, -30 dB = 0.1)
        let r: number
        if (scaleType === 'db') {
          value = Math.max(value, -30)
          r = (value + 30) / 30
        } else {
          r = value / (maxVal || 1)
        }

        // Spherical to Cartesian (physics convention: theta from Z-axis, phi from X-axis)
        const x = r * Math.sin(theta) * Math.cos(phi)
        const y = r * Math.sin(theta) * Math.sin(phi)
        const z = r * Math.cos(theta)

        positions.push(x, y, z)

        // Color based on value
        const color = getColor(value)
        colors.push(color.r, color.g, color.b)
      })
    })

    // Generate faces (triangles)
    for (let i = 0; i < nTheta - 1; i++) {
      for (let j = 0; j < nPhi - 1; j++) {
        const idx0 = i * nPhi + j
        const idx1 = i * nPhi + (j + 1)
        const idx2 = (i + 1) * nPhi + j
        const idx3 = (i + 1) * nPhi + (j + 1)

        // Triangle 1
        indices.push(idx0, idx2, idx1)
        // Triangle 2
        indices.push(idx1, idx2, idx3)
      }
    }

    // Handle wrap-around in phi direction (connect last column to first)
    for (let i = 0; i < nTheta - 1; i++) {
      const idx0 = i * nPhi + (nPhi - 1)
      const idx1 = i * nPhi
      const idx2 = (i + 1) * nPhi + (nPhi - 1)
      const idx3 = (i + 1) * nPhi

      indices.push(idx0, idx2, idx1)
      indices.push(idx1, idx2, idx3)
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    return { geometry, colors }
  }, [patternData, patternType, scaleType, normalize])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

const Pattern3D: React.FC<Pattern3DProps> = ({
  patternData,
  patternType,
  scaleType,
  normalize,
}) => {
  return (
    <Canvas style={{ background: '#1a1a1a' }}>
      <PerspectiveCamera makeDefault position={[2, 2, 2]} />
      <OrbitControls enableDamping dampingFactor={0.05} />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />

      {/* Axes helper */}
      <axesHelper args={[1.5]} />

      {/* Grid */}
      <gridHelper args={[2, 10]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Pattern mesh */}
      <PatternMesh
        patternData={patternData}
        patternType={patternType}
        scaleType={scaleType}
        normalize={normalize}
      />
    </Canvas>
  )
}

export default Pattern3D
