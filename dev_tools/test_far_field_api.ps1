# Test Far-Field Postprocessor Integration
# Tests far-field computation with dipole results

Write-Host "=" * 80
Write-Host "Testing Far-Field Postprocessor Integration"
Write-Host "=" * 80

$solverUrl = "http://localhost:8002"
$postprocessorUrl = "http://localhost:8003"

# Step 1: Solve dipole with multi-antenna solver
Write-Host "`nStep 1: Solving dipole with multi-antenna solver..."

$solveRequest = @{
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

try {
    $solveResponse = Invoke-RestMethod -Uri "$solverUrl/api/solve/multi" -Method Post -Body ($solveRequest | ConvertTo-Json -Depth 10) -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "  ✓ Solver completed" -ForegroundColor Green
    Write-Host "    Impedance (upper): $($solveResponse.antenna_solutions[0].input_impedance)"
    Write-Host "    Solve time: $($solveResponse.solve_time.ToString('F3')) s"
    
    # Step 2: Combine geometry and currents
    Write-Host "`nStep 2: Preparing far-field request..."
    
    # Combine nodes from both monopoles
    $allNodes = [System.Collections.ArrayList]::new()
    foreach ($node in $solveRequest.antennas[0].nodes) { [void]$allNodes.Add($node) }
    foreach ($node in $solveRequest.antennas[1].nodes) { [void]$allNodes.Add($node) }
    
    Write-Host "    Nodes combined: $($allNodes.Count)"
    
    # Combine edges (convert to 0-based indexing for postprocessor)
    $allEdges = [System.Collections.ArrayList]::new()
    # Upper: edges reference nodes 0-4 (0-based)
    [void]$allEdges.Add(@(0, 1))
    [void]$allEdges.Add(@(1, 2))
    [void]$allEdges.Add(@(2, 3))
    [void]$allEdges.Add(@(3, 4))
    # Lower: edges reference nodes 5-9 (0-based)
    [void]$allEdges.Add(@(5, 6))
    [void]$allEdges.Add(@(6, 7))
    [void]$allEdges.Add(@(7, 8))
    [void]$allEdges.Add(@(8, 9))
    
    Write-Host "    Edges combined: $($allEdges.Count)"
    
    # Combine radii
    $allRadii = @(0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001)
    
    Write-Host "    Radii combined: $($allRadii.Count)"
    
    # Combine currents
    $allCurrents = [System.Collections.ArrayList]::new()
    foreach ($c in $solveResponse.antenna_solutions[0].branch_currents) { [void]$allCurrents.Add($c) }
    foreach ($c in $solveResponse.antenna_solutions[1].branch_currents) { [void]$allCurrents.Add($c) }
    
    Write-Host "    Currents combined: $($allCurrents.Count)"
    
    # Step 3: Compute far-field pattern
    Write-Host "`nStep 3: Computing far-field pattern..."
    
    $farFieldRequest = @{
        frequencies = @(299792458.0)
        branch_currents = @(@($allCurrents))
        nodes = $allNodes
        edges = $allEdges
        radii = $allRadii
        theta_points = 19
        phi_points = 37
    }
    
    $farFieldResponse = Invoke-RestMethod -Uri "$postprocessorUrl/api/fields/far" -Method Post -Body ($farFieldRequest | ConvertTo-Json -Depth 10) -ContentType "application/json" -TimeoutSec 30 -ErrorAction Stop
    
    Write-Host "  ✓ Far-field computed" -ForegroundColor Green
    Write-Host "    Directivity: $($farFieldResponse.directivity.ToString('F2')) dBi"
    Write-Host "    Gain: $($farFieldResponse.gain.ToString('F2')) dBi"
    Write-Host "    Efficiency: $($farFieldResponse.efficiency.ToString('F2'))"
    Write-Host "    Max direction: θ=$($farFieldResponse.max_direction[0].ToString('F1'))°, φ=$($farFieldResponse.max_direction[1].ToString('F1'))°"
    Write-Host "    Angular grid: $($farFieldResponse.theta_angles.Count) x $($farFieldResponse.phi_angles.Count)"
    
    # Step 4: Validate against gold standard
    Write-Host "`nStep 4: Validating against gold standard..."
    
    $expectedDirectivity = 2.15
    $directivityError = [Math]::Abs($farFieldResponse.directivity - $expectedDirectivity)
    
    Write-Host "    Expected directivity: $expectedDirectivity dBi"
    Write-Host "    Computed directivity: $($farFieldResponse.directivity.ToString('F2')) dBi"
    Write-Host "    Error: $($directivityError.ToString('F2')) dB"
    
    if ($directivityError -lt 1.0) {
        Write-Host "    ✓ Within 1 dB tolerance" -ForegroundColor Green
    } else {
        Write-Host "    ⚠ Exceeds 1 dB tolerance" -ForegroundColor Yellow
    }
    
    Write-Host "`n" + ("=" * 80)
    Write-Host "✓ Far-Field Postprocessor Integration Test PASSED" -ForegroundColor Green
    Write-Host ("=" * 80)
    
} catch {
    Write-Host "`n" + ("=" * 80)
    Write-Host "✗ Test FAILED" -ForegroundColor Red
    Write-Host ("=" * 80)
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body:"
            Write-Host $responseBody
        } catch {}
    }
    exit 1
}
