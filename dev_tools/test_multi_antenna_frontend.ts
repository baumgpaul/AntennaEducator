/**
 * Test script for multi-antenna solver integration
 * Run with: npm run dev (in one terminal) and node --loader tsx dev_tools/test_multi_antenna_frontend.ts
 */

import { solveMultiAntenna, parseComplex, formatComplex } from '../frontend/src/api/solver'
import type { MultiAntennaRequest } from '../frontend/src/types/api'

async function testMultiAntennaSolver() {
  console.log('='.repeat(80))
  console.log('Testing Multi-Antenna Solver Frontend Integration')
  console.log('='.repeat(80))

  // Create a simple dipole test
  const frequency = 299.792458e6 // 1m wavelength
  const gap = 0.05 // 5cm gap
  const radius = 0.001 // 1mm wire

  // Upper monopole (6 nodes from +2.5cm to +22.5cm)
  const z_upper = [0.025, 0.075, 0.125, 0.175, 0.225]
  const nodes_upper = z_upper.map((z) => [0, 0, z])

  // Lower monopole (6 nodes from -2.5cm to -22.5cm)  
  const z_lower = [-0.025, -0.075, -0.125, -0.175, -0.225]
  const nodes_lower = z_lower.map((z) => [0, 0, z])

  const request: MultiAntennaRequest = {
    frequency,
    antennas: [
      {
        antenna_id: 'upper_monopole',
        nodes: nodes_upper,
        edges: [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
        radii: [radius, radius, radius, radius],
        voltage_sources: [
          {
            node_start: 0, // Ground
            node_end: 1,
            value: 1.0,
            R: 0.0,
          },
        ],
        current_sources: [],
        loads: [],
      },
      {
        antenna_id: 'lower_monopole',
        nodes: nodes_lower,
        edges: [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
        radii: [radius, radius, radius, radius],
        voltage_sources: [
          {
            node_start: 0, // Ground
            node_end: 1,
            value: -1.0,
            R: 0.0,
          },
        ],
        current_sources: [],
        loads: [],
      },
    ],
    config: {
      gauss_order: 6,
      include_skin_effect: true,
      resistivity: 1.68e-8,
      permeability: 1.0,
    },
  }

  try {
    console.log('\nSending request to /api/v1/solve/multi...')
    console.log(`Frequency: ${frequency / 1e6} MHz`)
    console.log(`Upper monopole: ${nodes_upper.length} nodes`)
    console.log(`Lower monopole: ${nodes_lower.length} nodes`)

    const response = await solveMultiAntenna(request)

    console.log('\n' + '-'.repeat(80))
    console.log('Response received!')
    console.log('-'.repeat(80))
    console.log(`Converged: ${response.converged}`)
    console.log(`Solve time: ${response.solve_time.toFixed(3)} s`)
    console.log(`Total nodes: ${response.n_total_nodes}`)
    console.log(`Total edges: ${response.n_total_edges}`)
    console.log(`Antenna solutions: ${response.antenna_solutions.length}`)

    for (const sol of response.antenna_solutions) {
      console.log(`\n${sol.antenna_id}:`)
      if (sol.input_impedance !== null) {
        const z = parseComplex(sol.input_impedance)
        console.log(`  Input Impedance: ${formatComplex(z)} Ω`)
        console.log(`    Real: ${z.real.toFixed(2)} Ω`)
        console.log(`    Imag: ${z.imag.toFixed(2)} Ω`)
      }
      console.log(`  Branch currents: ${sol.branch_currents.length}`)
      console.log(`  Node voltages: ${sol.node_voltages.length}`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✓ Multi-Antenna Solver Integration Test PASSED')
    console.log('='.repeat(80))
  } catch (error: any) {
    console.error('\n' + '='.repeat(80))
    console.error('✗ Test FAILED')
    console.error('='.repeat(80))
    console.error('Error:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  }
}

// Run the test
testMultiAntennaSolver()
