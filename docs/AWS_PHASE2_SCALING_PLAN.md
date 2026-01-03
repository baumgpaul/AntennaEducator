# AWS Phase 2: Scaling & Advanced Features Plan

**Version**: 1.0  
**Created**: January 3, 2026  
**Prerequisites**: MVP Deployment (Phase 1) Complete  
**Estimated Start**: After MVP stabilization (~4-6 weeks after Phase 1)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 2A: Async Job Processing](#2-phase-2a-async-job-processing)
3. [Phase 2B: Fargate for Long-Running Jobs](#3-phase-2b-fargate-for-long-running-jobs)
4. [Phase 2C: Caching & Performance](#4-phase-2c-caching--performance)
5. [Phase 2D: Observability & Monitoring](#5-phase-2d-observability--monitoring)
6. [Phase 2E: Multi-Region & High Availability](#6-phase-2e-multi-region--high-availability)
7. [Implementation Timeline](#7-implementation-timeline)
8. [Cost Projections](#8-cost-projections)

---

## 1. Overview

### Why Phase 2?

Phase 1 (MVP) uses synchronous Lambda functions with a 15-minute timeout. This works for teaching/educational use cases with simple antenna models, but has limitations:

| Limitation | Impact | Phase 2 Solution |
|------------|--------|------------------|
| Lambda 15-min timeout | Large problems fail | Fargate (no timeout) |
| Synchronous API calls | UI blocks during solve | Async with SQS + polling |
| Cold starts (5-10s) | Poor first-request latency | Provisioned concurrency |
| No caching | Repeated computations | ElastiCache Redis |
| Basic monitoring | Limited debugging | X-Ray tracing |

### Phase 2 Goals

1. **Remove timeout limitations** - Run solver jobs of any duration
2. **Improve UX** - Non-blocking async job submission with progress updates
3. **Better performance** - Caching and reduced cold starts
4. **Production-grade observability** - Distributed tracing and alerting
5. **Prepare for scale** - Handle 100+ concurrent users

### Architecture Evolution

```
Phase 1 (MVP):
  User → API Gateway → Lambda (sync) → DynamoDB/S3
  
Phase 2 (Async + Fargate):
  User → API Gateway → Lambda (submit job) → SQS Queue
                                                  ↓
                              Step Functions → Fargate Task (solver)
                                                  ↓
                              SNS/WebSocket ← Job Complete → DynamoDB/S3
```

---

## 2. Phase 2A: Async Job Processing

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Async Job Processing                              │
│                                                                          │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────────────┐ │
│  │  Client  │───▶│API Gateway│───▶│  Lambda  │───▶│   SQS Queue      │ │
│  │          │    │           │    │ (Submit) │    │ (solver-jobs)    │ │
│  └──────────┘    └───────────┘    └──────────┘    └────────┬─────────┘ │
│       │                                                     │           │
│       │              ┌──────────────────────────────────────┘           │
│       │              ▼                                                  │
│       │         ┌──────────────────────────────────────────────────┐   │
│       │         │              Step Functions                       │   │
│       │         │                                                   │   │
│       │         │  ┌─────────┐   ┌─────────┐   ┌─────────────────┐ │   │
│       │         │  │ Validate│──▶│  Solve  │──▶│ Store Results   │ │   │
│       │         │  │  Input  │   │ (Lambda │   │ (DynamoDB + S3) │ │   │
│       │         │  │         │   │   or    │   │                 │ │   │
│       │         │  │         │   │ Fargate)│   │                 │ │   │
│       │         │  └─────────┘   └─────────┘   └────────┬────────┘ │   │
│       │         │                                       │          │   │
│       │         └───────────────────────────────────────┼──────────┘   │
│       │                                                 │               │
│       │    ┌────────────────────────────────────────────┘               │
│       │    ▼                                                            │
│       │  ┌──────────────────────────────────────────────────────────┐  │
│       │  │                    Notifications                          │  │
│       │  │                                                           │  │
│       │  │  Option A: Polling          Option B: WebSocket           │  │
│       │  │  GET /jobs/{id}/status      ws://api.../jobs/{id}         │  │
│       │  │  (simpler, MVP-friendly)    (real-time, better UX)        │  │
│       │  │                                                           │  │
│       └──┴───────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Step Functions State Machine

```json
{
  "Comment": "PEEC Solver Job Workflow",
  "StartAt": "ValidateInput",
  "States": {
    "ValidateInput": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:antenna-validator",
      "Next": "CheckProblemSize",
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "JobFailed"
      }]
    },
    "CheckProblemSize": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.estimated_time_seconds",
          "NumericLessThan": 300,
          "Next": "SolveLambda"
        },
        {
          "Variable": "$.estimated_time_seconds",
          "NumericGreaterThanEquals": 300,
          "Next": "SolveFargate"
        }
      ],
      "Default": "SolveLambda"
    },
    "SolveLambda": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:antenna-solver",
      "TimeoutSeconds": 900,
      "Next": "StoreResults",
      "Catch": [{
        "ErrorEquals": ["States.Timeout"],
        "Next": "SolveFargate"
      }]
    },
    "SolveFargate": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:runTask.sync",
      "Parameters": {
        "LaunchType": "FARGATE",
        "Cluster": "antenna-solver-cluster",
        "TaskDefinition": "antenna-solver-task",
        "NetworkConfiguration": {
          "AwsvpcConfiguration": {
            "Subnets": ["subnet-xxx"],
            "SecurityGroups": ["sg-xxx"],
            "AssignPublicIp": "ENABLED"
          }
        },
        "Overrides": {
          "ContainerOverrides": [{
            "Name": "solver",
            "Environment": [
              {"Name": "JOB_ID", "Value.$": "$.job_id"},
              {"Name": "INPUT_S3_KEY", "Value.$": "$.input_key"}
            ]
          }]
        }
      },
      "Next": "StoreResults"
    },
    "StoreResults": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:antenna-store-results",
      "Next": "NotifyComplete"
    },
    "NotifyComplete": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:antenna-notify",
      "End": true
    },
    "JobFailed": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:ACCOUNT:function:antenna-notify-failure",
      "End": true
    }
  }
}
```

### 2.3 API Changes

**New Endpoints**:

```yaml
# Submit async job
POST /api/v1/jobs/submit
Request:
  {
    "project_id": "uuid",
    "job_type": "solve",  # solve, sweep, postprocess
    "parameters": {
      "frequencies": [300e6],
      "mesh_id": "uuid"
    }
  }
Response:
  {
    "job_id": "uuid",
    "status": "queued",
    "estimated_time_seconds": 45,
    "poll_url": "/api/v1/jobs/{job_id}/status"
  }

# Poll job status
GET /api/v1/jobs/{job_id}/status
Response:
  {
    "job_id": "uuid",
    "status": "running",  # queued, running, completed, failed
    "progress": 45,       # percentage (0-100)
    "current_step": "Solving frequency 3/10",
    "started_at": "2026-01-03T10:00:00Z",
    "estimated_completion": "2026-01-03T10:02:30Z"
  }

# Get job results (when completed)
GET /api/v1/jobs/{job_id}/results
Response:
  {
    "job_id": "uuid",
    "status": "completed",
    "results": {
      "currents_s3_key": "results/...",
      "impedance": {"real": 73.2, "imag": 42.5}
    }
  }

# Cancel job
DELETE /api/v1/jobs/{job_id}
Response:
  {
    "job_id": "uuid",
    "status": "cancelled"
  }
```

### 2.4 Frontend Changes

```typescript
// frontend/src/hooks/useAsyncJob.ts
import { useState, useEffect, useCallback } from 'react';
import { jobsApi } from '../api/jobs';

interface JobState {
  jobId: string | null;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  results: any | null;
  error: string | null;
}

export function useAsyncJob() {
  const [state, setState] = useState<JobState>({
    jobId: null,
    status: 'idle',
    progress: 0,
    currentStep: '',
    results: null,
    error: null,
  });

  const submitJob = useCallback(async (projectId: string, params: any) => {
    try {
      const response = await jobsApi.submit({
        project_id: projectId,
        job_type: 'solve',
        parameters: params,
      });
      
      setState(prev => ({
        ...prev,
        jobId: response.job_id,
        status: 'queued',
        progress: 0,
      }));
      
      return response.job_id;
    } catch (error) {
      setState(prev => ({ ...prev, status: 'failed', error: error.message }));
      throw error;
    }
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (!state.jobId || state.status === 'completed' || state.status === 'failed') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const status = await jobsApi.getStatus(state.jobId!);
        
        setState(prev => ({
          ...prev,
          status: status.status,
          progress: status.progress,
          currentStep: status.current_step,
        }));

        if (status.status === 'completed') {
          const results = await jobsApi.getResults(state.jobId!);
          setState(prev => ({ ...prev, results: results.results }));
        }
      } catch (error) {
        setState(prev => ({ ...prev, status: 'failed', error: error.message }));
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [state.jobId, state.status]);

  const cancelJob = useCallback(async () => {
    if (state.jobId) {
      await jobsApi.cancel(state.jobId);
      setState(prev => ({ ...prev, status: 'idle', jobId: null }));
    }
  }, [state.jobId]);

  return { ...state, submitJob, cancelJob };
}
```

### 2.5 Terraform Resources

```hcl
# terraform/modules/async-jobs/main.tf

# SQS Queue for job submissions
resource "aws_sqs_queue" "solver_jobs" {
  name                       = "antenna-solver-jobs-${var.environment}"
  visibility_timeout_seconds = 930  # > Lambda timeout
  message_retention_seconds  = 86400  # 1 day
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.solver_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "solver_dlq" {
  name = "antenna-solver-jobs-dlq-${var.environment}"
}

# Step Functions State Machine
resource "aws_sfn_state_machine" "solver_workflow" {
  name     = "antenna-solver-workflow-${var.environment}"
  role_arn = aws_iam_role.step_functions.arn
  
  definition = templatefile("${path.module}/state-machine.json", {
    validator_lambda_arn = var.validator_lambda_arn
    solver_lambda_arn    = var.solver_lambda_arn
    store_lambda_arn     = var.store_results_lambda_arn
    notify_lambda_arn    = var.notify_lambda_arn
    fargate_cluster_arn  = aws_ecs_cluster.solver.arn
    fargate_task_arn     = aws_ecs_task_definition.solver.arn
    subnet_ids           = var.subnet_ids
    security_group_ids   = var.security_group_ids
  })
}

# DynamoDB table for job tracking
resource "aws_dynamodb_table" "jobs" {
  name         = "antenna-jobs-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"
  
  attribute {
    name = "PK"
    type = "S"
  }
  
  attribute {
    name = "SK"
    type = "S"
  }
  
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    projection_type = "ALL"
  }
  
  ttl {
    attribute_name = "TTL"
    enabled        = true
  }
}
```

---

## 3. Phase 2B: Fargate for Long-Running Jobs

### 3.1 When to Use Fargate

| Criteria | Lambda | Fargate |
|----------|--------|---------|
| Estimated time < 5 min | ✅ | ❌ |
| Estimated time 5-15 min | ✅ (with warning) | Optional |
| Estimated time > 15 min | ❌ | ✅ |
| Memory > 10 GB needed | ❌ | ✅ |
| GPU acceleration (future) | ❌ | ✅ |

### 3.2 Fargate Task Definition

```hcl
# terraform/modules/fargate-solver/main.tf

resource "aws_ecs_cluster" "solver" {
  name = "antenna-solver-${var.environment}"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "solver" {
  family                   = "antenna-solver-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 4096   # 4 vCPU
  memory                   = 8192   # 8 GB
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([
    {
      name  = "solver"
      image = "${var.ecr_repository_url}:${var.image_tag}"
      
      environment = [
        { name = "DYNAMODB_TABLE", value = var.dynamodb_table },
        { name = "S3_BUCKET", value = var.s3_bucket },
        { name = "USE_DYNAMODB", value = "true" }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.solver.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "solver"
        }
      }
      
      # Health check
      healthCheck = {
        command     = ["CMD-SHELL", "python -c 'import backend.solver' || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# Auto-scaling for Fargate (optional)
resource "aws_appautoscaling_target" "solver" {
  max_capacity       = 10
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.solver.name}/${aws_ecs_service.solver.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "solver_cpu" {
  name               = "solver-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.solver.resource_id
  scalable_dimension = aws_appautoscaling_target.solver.scalable_dimension
  service_namespace  = aws_appautoscaling_target.solver.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### 3.3 Solver Container Entry Point

```python
# backend/solver/fargate_entrypoint.py
"""
Fargate entry point for long-running solver jobs.
Reads job parameters from environment/S3, runs solver, stores results.
"""
import os
import json
import boto3
from datetime import datetime

from backend.solver.solver import solve_mesh
from backend.common.repositories.factory import get_result_repository

def main():
    # Get job parameters from environment
    job_id = os.environ['JOB_ID']
    input_s3_key = os.environ['INPUT_S3_KEY']
    dynamodb_table = os.environ['DYNAMODB_TABLE']
    s3_bucket = os.environ['S3_BUCKET']
    
    s3 = boto3.client('s3')
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(dynamodb_table)
    
    try:
        # Update job status to running
        update_job_status(table, job_id, 'running', progress=0)
        
        # Download input from S3
        response = s3.get_object(Bucket=s3_bucket, Key=input_s3_key)
        input_data = json.loads(response['Body'].read().decode('utf-8'))
        
        mesh = input_data['mesh']
        frequencies = input_data['frequencies']
        
        results = []
        total_freqs = len(frequencies)
        
        for i, freq in enumerate(frequencies):
            # Update progress
            progress = int((i / total_freqs) * 100)
            update_job_status(
                table, job_id, 'running', 
                progress=progress,
                current_step=f"Solving frequency {i+1}/{total_freqs} ({freq/1e6:.1f} MHz)"
            )
            
            # Solve
            result = solve_mesh(mesh, freq)
            results.append(result)
        
        # Store results in S3
        results_key = f"results/{job_id}/results.json"
        s3.put_object(
            Bucket=s3_bucket,
            Key=results_key,
            Body=json.dumps(results, default=str),
            ContentType='application/json'
        )
        
        # Update job status to completed
        update_job_status(
            table, job_id, 'completed', 
            progress=100,
            results_key=results_key
        )
        
    except Exception as e:
        update_job_status(table, job_id, 'failed', error=str(e))
        raise

def update_job_status(table, job_id, status, progress=None, current_step=None, results_key=None, error=None):
    update_expr = "SET #status = :status, UpdatedAt = :updated"
    expr_values = {
        ':status': status,
        ':updated': datetime.utcnow().isoformat()
    }
    expr_names = {'#status': 'Status'}
    
    if progress is not None:
        update_expr += ", Progress = :progress"
        expr_values[':progress'] = progress
    
    if current_step:
        update_expr += ", CurrentStep = :step"
        expr_values[':step'] = current_step
    
    if results_key:
        update_expr += ", ResultsKey = :results"
        expr_values[':results'] = results_key
    
    if error:
        update_expr += ", Error = :error"
        expr_values[':error'] = error
    
    table.update_item(
        Key={'PK': f'JOB#{job_id}', 'SK': 'METADATA'},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values
    )

if __name__ == '__main__':
    main()
```

---

## 4. Phase 2C: Caching & Performance

### 4.1 ElastiCache Redis

```hcl
# terraform/modules/cache/main.tf

resource "aws_elasticache_subnet_group" "main" {
  name       = "antenna-cache-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "antenna-cache-${var.environment}"
  description                = "Redis cache for antenna simulator"
  node_type                  = "cache.t3.micro"  # Start small
  num_cache_clusters         = 1                  # Single node for MVP
  port                       = 6379
  parameter_group_name       = "default.redis7"
  automatic_failover_enabled = false
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  
  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
}
```

### 4.2 Caching Strategy

```python
# backend/common/cache/redis_cache.py
import redis
import json
import hashlib
from typing import Optional, Any
from functools import wraps

class AntennaCache:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self.default_ttl = 3600  # 1 hour
    
    def _make_key(self, prefix: str, data: dict) -> str:
        """Create deterministic cache key from input data."""
        data_str = json.dumps(data, sort_keys=True)
        hash_val = hashlib.sha256(data_str.encode()).hexdigest()[:16]
        return f"{prefix}:{hash_val}"
    
    def get_mesh(self, antenna_params: dict) -> Optional[dict]:
        """Get cached mesh for antenna parameters."""
        key = self._make_key("mesh", antenna_params)
        cached = self.redis.get(key)
        return json.loads(cached) if cached else None
    
    def set_mesh(self, antenna_params: dict, mesh: dict, ttl: int = None):
        """Cache mesh for antenna parameters."""
        key = self._make_key("mesh", antenna_params)
        self.redis.setex(key, ttl or self.default_ttl, json.dumps(mesh))
    
    def get_solver_result(self, mesh_hash: str, frequency: float) -> Optional[dict]:
        """Get cached solver result."""
        key = f"solve:{mesh_hash}:{frequency}"
        cached = self.redis.get(key)
        return json.loads(cached) if cached else None
    
    def set_solver_result(self, mesh_hash: str, frequency: float, result: dict, ttl: int = None):
        """Cache solver result."""
        key = f"solve:{mesh_hash}:{frequency}"
        self.redis.setex(key, ttl or self.default_ttl * 24, json.dumps(result))  # 24 hours


def cached_mesh(cache: AntennaCache):
    """Decorator for caching mesh generation."""
    def decorator(func):
        @wraps(func)
        async def wrapper(params: dict, *args, **kwargs):
            # Check cache
            cached = cache.get_mesh(params)
            if cached:
                return cached
            
            # Generate mesh
            result = await func(params, *args, **kwargs)
            
            # Cache result
            cache.set_mesh(params, result)
            return result
        return wrapper
    return decorator
```

### 4.3 Lambda Provisioned Concurrency

```hcl
# Reduce cold starts for frequently used functions
resource "aws_lambda_provisioned_concurrency_config" "preprocessor" {
  function_name                     = aws_lambda_function.preprocessor.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_function.preprocessor.version
}

resource "aws_lambda_provisioned_concurrency_config" "projects" {
  function_name                     = aws_lambda_function.projects.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_function.projects.version
}
```

---

## 5. Phase 2D: Observability & Monitoring

### 5.1 X-Ray Tracing

```python
# backend/common/tracing/xray.py
from aws_xray_sdk.core import xray_recorder, patch_all
from aws_xray_sdk.ext.util import get_hostname

# Patch all supported libraries (boto3, requests, etc.)
patch_all()

def configure_xray(service_name: str):
    """Configure X-Ray for a service."""
    xray_recorder.configure(
        service=service_name,
        sampling=True,
        context_missing='LOG_ERROR',
        daemon_address='127.0.0.1:2000',  # Local daemon
    )

# Usage in FastAPI
from fastapi import FastAPI
from aws_xray_sdk.ext.fastapi.middleware import XRayMiddleware

app = FastAPI()
XRayMiddleware(app, xray_recorder)
```

### 5.2 CloudWatch Dashboard

```hcl
# terraform/modules/monitoring/dashboard.tf

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "antenna-simulator-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      # API Gateway metrics
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway Requests"
          region = var.region
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", var.api_gateway_id],
            [".", "4XXError", ".", "."],
            [".", "5XXError", ".", "."]
          ]
          period = 300
          stat   = "Sum"
        }
      },
      # Lambda metrics
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Duration"
          region = var.region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "antenna-preprocessor-${var.environment}"],
            [".", ".", ".", "antenna-solver-${var.environment}"],
            [".", ".", ".", "antenna-postprocessor-${var.environment}"],
            [".", ".", ".", "antenna-projects-${var.environment}"]
          ]
          period = 300
          stat   = "Average"
        }
      },
      # DynamoDB metrics
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Operations"
          region = var.region
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", var.dynamodb_table],
            [".", "ConsumedWriteCapacityUnits", ".", "."]
          ]
          period = 300
          stat   = "Sum"
        }
      },
      # Step Functions (if enabled)
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Step Functions Executions"
          region = var.region
          metrics = [
            ["AWS/States", "ExecutionsSucceeded", "StateMachineArn", var.state_machine_arn],
            [".", "ExecutionsFailed", ".", "."],
            [".", "ExecutionsTimedOut", ".", "."]
          ]
          period = 300
          stat   = "Sum"
        }
      }
    ]
  })
}
```

### 5.3 Alarms

```hcl
# terraform/modules/monitoring/alarms.tf

resource "aws_cloudwatch_metric_alarm" "api_5xx_errors" {
  alarm_name          = "antenna-api-5xx-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API Gateway 5XX errors exceeded threshold"
  
  dimensions = {
    ApiId = var.api_gateway_id
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(["preprocessor", "solver", "postprocessor", "projects"])
  
  alarm_name          = "antenna-${each.key}-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda ${each.key} errors exceeded threshold"
  
  dimensions = {
    FunctionName = "antenna-${each.key}-${var.environment}"
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_sns_topic" "alerts" {
  name = "antenna-alerts-${var.environment}"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
```

---

## 6. Phase 2E: Multi-Region & High Availability

### 6.1 Multi-Region Architecture (Future)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Route 53 (Latency-Based)                    │
└───────────────────┬─────────────────────┬───────────────────────┘
                    │                     │
        ┌───────────▼───────────┐   ┌─────▼───────────────┐
        │   eu-west-1 (Primary) │   │  us-east-1 (DR)     │
        │                       │   │                      │
        │  CloudFront           │   │  CloudFront         │
        │  API Gateway          │   │  API Gateway        │
        │  Lambda Functions     │   │  Lambda Functions   │
        │  DynamoDB (Global)    │◄──►  DynamoDB (Replica) │
        │  S3 (Cross-Region)    │◄──►  S3 (Replica)       │
        └───────────────────────┘   └──────────────────────┘
```

### 6.2 DynamoDB Global Tables

```hcl
resource "aws_dynamodb_table" "global" {
  name         = "antenna-simulator-global"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"
  
  # Enable streams for global tables
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  
  # ... attributes ...
  
  replica {
    region_name = "us-east-1"
  }
}
```

---

## 7. Implementation Timeline

### Phase 2A: Async Jobs (2-3 weeks)
- Week 1: Step Functions state machine, SQS integration
- Week 2: Job status API, polling mechanism
- Week 3: Frontend integration, testing

### Phase 2B: Fargate (1-2 weeks)
- Week 1: Fargate task definition, container updates
- Week 2: Step Functions integration, testing

### Phase 2C: Caching (1 week)
- Day 1-3: ElastiCache setup, cache layer implementation
- Day 4-5: Integration testing, cache invalidation

### Phase 2D: Observability (1 week)
- Day 1-2: X-Ray integration
- Day 3-4: CloudWatch dashboard
- Day 5: Alarms and notifications

### Phase 2E: Multi-Region (2-3 weeks, optional)
- Only implement if needed for latency/DR requirements

### Phase 2F: E2E Testing (1-2 weeks, on roadmap)
- **Framework**: Playwright or Cypress (decision pending)
- **Scope**: Critical user journeys only (login, create project, run solve, view results)
- **When**: Run in CI only (too slow for pre-commit)
- **Trigger**: After staging deployment, before production approval
- **Status**: ON ROADMAP - not yet implemented

**E2E Test Candidates**:
```typescript
// Example Playwright test structure (future)
test.describe('Critical User Journeys', () => {
  test('user can create project and run simulation', async ({ page }) => {
    // 1. Login
    // 2. Create new project
    // 3. Add antenna element
    // 4. Run solver
    // 5. View results in postprocessing tab
  });
  
  test('user can export results to VTU', async ({ page }) => {
    // 1. Open project with results
    // 2. Navigate to postprocessing
    // 3. Export to ParaView format
    // 4. Verify download
  });
});
```

**Integration with CI/CD** (future):
```yaml
# In CodePipeline, after staging deploy
  stage {
    name = "E2ETests"
    action {
      name     = "PlaywrightTests"
      category = "Test"
      # Run against staging environment
    }
  }
```

**Total Phase 2 Estimate**: 6-10 weeks (+ 1-2 weeks for E2E when prioritized)

---

## 8. Cost Projections

### Phase 2 Additional Costs (Monthly)

| Service | Light Usage | Medium Usage | Notes |
|---------|-------------|--------------|-------|
| Step Functions | $1-2 | $5-10 | $25/million transitions |
| SQS | <$1 | $1-2 | First 1M requests free |
| Fargate (solver) | $5-20 | $50-100 | ~$0.04/vCPU-hour |
| ElastiCache | $13 | $13 | t3.micro minimum |
| X-Ray | $1-5 | $10-20 | $5/million traces |
| CloudWatch Logs | $2-5 | $10-20 | $0.50/GB ingested |
| **Total Additional** | **$25-50** | **$100-200** | On top of Phase 1 |

### Cost Optimization Tips

1. **Use Fargate Spot** for non-critical solver jobs (70% discount)
2. **Set appropriate TTLs** on DynamoDB items
3. **Use S3 Intelligent-Tiering** for results storage
4. **Review provisioned concurrency** monthly (expensive if underutilized)
5. **Set CloudWatch log retention** to 7-30 days

---

## Quick Reference Commands

```bash
# Deploy Phase 2A (async jobs)
cd terraform/environments/staging
terraform apply -target=module.async_jobs

# Deploy Phase 2B (Fargate)
terraform apply -target=module.fargate_solver

# Deploy Phase 2C (caching)
terraform apply -target=module.elasticache

# Deploy Phase 2D (monitoring)
terraform apply -target=module.monitoring

# Test async job submission
curl -X POST https://api.nyakyagyawa.com/jobs/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "...", "job_type": "solve", "parameters": {...}}'

# Check job status
curl https://api.nyakyagyawa.com/jobs/{job_id}/status \
  -H "Authorization: Bearer $TOKEN"
```

---

**Document Status**: Ready for Phase 2 Implementation (after MVP complete)  
**Dependencies**: Phase 1 MVP deployment must be stable  
**Next Review**: After Phase 1 completion
