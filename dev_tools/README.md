# Development Tools

Utilities for local development, debugging, deployment, and testing.
**Not part of the production code.**

## Directory Structure

```
dev_tools/
├── visualization/                  # Geometry visualization & plotting
│   ├── visualization.py            # Core visualization utilities
│   ├── save_dipole_plot.py          # Generate PNG of antenna geometry
│   ├── view_dipole.py               # Interactive 3D viewer
│   ├── visualize_example.py         # Multiple visualization examples
│   ├── run_visualization_demo.py    # Visualization demo
│   └── test_3d_viz.py               # 3D viz sanity check
├── check_services.ps1               # Verify all backend services are running
├── rebuild_lambda_images.ps1        # Build + push Docker images → ECR → update Lambdas
├── run_integration_tests.ps1        # Run integration test suite
├── setup_dynamodb_local.py          # Create DynamoDB Local tables
├── start_all_services.ps1           # Start all backend services (Windows)
├── start_backend.ps1                # Start backend services (Linux / macOS)
├── start_backend_windows.ps1        # Start backend services (Windows, alternate)
├── start_solver_service.ps1         # Start solver service only
├── deploy_api_gateway.ps1           # Deploy API Gateway (may be superseded by Terraform)
├── deploy_cognito.ps1               # Deploy Cognito resources (may be superseded by Terraform)
├── test_aws_pipeline.py             # End-to-end AWS smoke test (preprocessor → solver → postprocessor)
├── test_current_source_golden.py    # MATLAB golden-standard validation test
├── test_incremental_postprocessing.py # Integration test using FastAPI TestClient
├── test_backend_quick.ps1           # Quick backend smoke test
├── test_cognito.ps1                 # Cognito integration test
├── lumped_element_examples.py       # Lumped element API usage examples
└── README.md                        # This file
```

## Quick Reference

### Local Development

```powershell
# Start all backend services (one terminal per service)
.\dev_tools\start_all_services.ps1

# Or start individual services
uvicorn backend.preprocessor.main:app --port 8001 --reload
uvicorn backend.solver.main:app --port 8002 --reload
uvicorn backend.postprocessor.main:app --port 8003 --reload
uvicorn backend.projects.main:app --port 8010 --reload

# Verify services are running
.\dev_tools\check_services.ps1
```

### DynamoDB Local Setup

```powershell
# Start DynamoDB Local container
docker run -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory

# Create required tables
python dev_tools/setup_dynamodb_local.py
```

### AWS Deployment

```powershell
# Deploy all 4 Lambda services (build → ECR push → Lambda update)
.\dev_tools\rebuild_lambda_images.ps1

# Verify AWS deployment
python dev_tools/test_aws_pipeline.py
```

### Visualization

```python
from dev_tools.visualization.visualization import visualize_mesh

# All-in-one: console output + 3D plot + PNG export
visualize_mesh(mesh, element, console=True, plot=True, save_path="antenna.png")
```

### Validation

```powershell
# Run MATLAB golden-standard comparison
python dev_tools/test_current_source_golden.py

# Quick backend smoke test
.\dev_tools\test_backend_quick.ps1
```
