# Test Simple Dipole Creation via API
# This tests the most basic frontend-to-backend flow

Write-Host "`n=== Testing Dipole Creation API ===" -ForegroundColor Cyan

# Test data - simple half-wave dipole at 100 MHz
$dipoleRequest = @{
    antenna = @{
        length = 1.5  # meters
        radius = 0.001  # 1mm wire
        feed_gap = 0.01  # 1cm gap
        feed_type = "gap"
        num_segments = 21
        orientation = @(0, 0, 1)  # Z-axis
        position = @(0, 0, 0)
    }
    frequency = 100000000.0  # 100 MHz
} | ConvertTo-Json -Depth 10

Write-Host "`nSending request to preprocessor..." -ForegroundColor Yellow
Write-Host "Endpoint: http://localhost:8001/api/geometry/dipole" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "http://localhost:8001/api/geometry/dipole" `
        -Method POST `
        -Body $dipoleRequest `
        -ContentType "application/json" `
        -TimeoutSec 10
    
    Write-Host "`n✅ SUCCESS!" -ForegroundColor Green
    Write-Host "`nResponse Summary:" -ForegroundColor Cyan
    Write-Host "  Geometry ID: $($response.geometry_id)" -ForegroundColor White
    Write-Host "  Number of nodes: $($response.mesh.nodes.Count)" -ForegroundColor White
    Write-Host "  Number of segments: $($response.mesh.segments.Count)" -ForegroundColor White
    Write-Host "  Total length: $($response.mesh.metadata.total_length) m" -ForegroundColor White
    
    Write-Host "`nMesh Details:" -ForegroundColor Cyan
    Write-Host "  First node: [$($response.mesh.nodes[0].position -join ', ')]" -ForegroundColor Gray
    Write-Host "  Last node:  [$($response.mesh.nodes[-1].position -join ', ')]" -ForegroundColor Gray
    
    Write-Host "`n✅ Backend is working correctly!" -ForegroundColor Green
    Write-Host "   You can now connect the frontend." -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Gray
    
    if ($_.Exception.Message -like "*Unable to connect*") {
        Write-Host "`nℹ️  Backend might not be running. Start it with:" -ForegroundColor Yellow
        Write-Host "   .\dev_tools\start_all_services.ps1" -ForegroundColor White
    }
}

Write-Host ""
