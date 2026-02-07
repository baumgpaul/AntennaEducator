# Test Multi-Antenna Solver Frontend Integration
# Tests that the new /api/solve/multi endpoint works through the frontend API

Write-Host "=" * 80
Write-Host "Testing Multi-Antenna Solver Frontend Integration"
Write-Host "=" * 80

$baseUrl = "http://localhost:8002"
$endpoint = "/api/solve/multi"

# Build test request - two monopoles forming a dipole
$request = @{
    frequency = 299792458.0
    antennas = @(
        @{
            antenna_id = "upper_monopole"
            nodes = @(
                @(0, 0, 0.025),
                @(0, 0, 0.075),
                @(0, 0, 0.125),
                @(0, 0, 0.175),
                @(0, 0, 0.225)
            )
            edges = @(
                @(1, 2),
                @(2, 3),
                @(3, 4),
                @(4, 5)
            )
            radii = @(0.001, 0.001, 0.001, 0.001)
            voltage_sources = @(
                @{
                    node_start = 0
                    node_end = 1
                    value = 1.0
                    R = 0.0
                }
            )
            current_sources = @()
            loads = @()
        },
        @{
            antenna_id = "lower_monopole"
            nodes = @(
                @(0, 0, -0.025),
                @(0, 0, -0.075),
                @(0, 0, -0.125),
                @(0, 0, -0.175),
                @(0, 0, -0.225)
            )
            edges = @(
                @(1, 2),
                @(2, 3),
                @(3, 4),
                @(4, 5)
            )
            radii = @(0.001, 0.001, 0.001, 0.001)
            voltage_sources = @(
                @{
                    node_start = 0
                    node_end = 1
                    value = -1.0
                    R = 0.0
                }
            )
            current_sources = @()
            loads = @()
        }
    )
    config = @{
        gauss_order = 6
        include_skin_effect = $true
        resistivity = 1.68e-8
        permeability = 1.0
    }
}

Write-Host "`nSending request to $baseUrl$endpoint..."
Write-Host "Frequency: 299.79 MHz (λ = 1m)"
Write-Host "Upper monopole: 5 nodes, 4 edges"
Write-Host "Lower monopole: 5 nodes, 4 edges"

try {
    $response = Invoke-RestMethod -Uri "$baseUrl$endpoint" -Method Post -Body ($request | ConvertTo-Json -Depth 10) -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "`n" + ("-" * 80)
    Write-Host "Response received!"
    Write-Host ("-" * 80)
    Write-Host "Converged: $($response.converged)"
    Write-Host "Solve time: $($response.solve_time.ToString('F3')) s"
    Write-Host "Total nodes: $($response.n_total_nodes)"
    Write-Host "Total edges: $($response.n_total_edges)"
    Write-Host "Antenna solutions: $($response.antenna_solutions.Count)"
    
    foreach ($sol in $response.antenna_solutions) {
        Write-Host "`n$($sol.antenna_id):"
        if ($sol.input_impedance) {
            Write-Host "  Input Impedance: $($sol.input_impedance)"
        }
        Write-Host "  Branch currents: $($sol.branch_currents.Count)"
        Write-Host "  Node voltages: $($sol.node_voltages.Count)"
    }
    
    Write-Host "`n" + ("=" * 80)
    Write-Host "✓ Multi-Antenna Solver Integration Test PASSED" -ForegroundColor Green
    Write-Host ("=" * 80)
    
} catch {
    Write-Host "`n" + ("=" * 80)
    Write-Host "✗ Test FAILED" -ForegroundColor Red
    Write-Host ("=" * 80)
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
    exit 1
}
