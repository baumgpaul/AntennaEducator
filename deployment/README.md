# Docker Deployment

This directory contains Docker and deployment configurations for the Antenna Educator platform.

## Quick Start

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- 8GB+ RAM available for Docker
- 10GB+ disk space

### Start All Services

```bash
# From project root
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Access Points

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **PostgreSQL**: localhost:5432 (antenna/antenna123)

## Services

### Frontend (Port 3000)
React application with Nginx web server

### API Gateway (Port 8000)
Nginx reverse proxy routing to backend services

### Backend Services
- **Preprocessor** (internal 8001): Antenna geometry and mesh generation
- **Solver** (internal 8002): PEEC electromagnetic solver
- **Postprocessor** (internal 8003): Results analysis and visualization

### PostgreSQL (Port 5432)
Metadata database for projects and simulations

### MinIO (Ports 9000/9001)
S3-compatible object storage for geometry and result files

## Configuration

### Environment Variables

Backend services use these environment variables:

```bash
DATABASE_URL=postgresql://antenna:antenna123@postgres:5432/antenna_db
STORAGE_URL=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Nginx Configuration

API Gateway routes:
- `/api/preprocess` → preprocessor:8001
- `/api/solve` → solver:8002
- `/api/postprocess` → postprocessor:8003

## Development

### Rebuild Services

```bash
# Rebuild all services
docker-compose build

# Rebuild specific service
docker-compose build solver

# Rebuild and restart
docker-compose up -d --build
```

### View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f solver

# Last 100 lines
docker-compose logs --tail=100 solver
```

### Execute Commands in Containers

```bash
# Shell into solver container
docker-compose exec solver /bin/bash

# Run Python script
docker-compose exec solver python -c "import numpy; print(numpy.__version__)"

# Check database
docker-compose exec postgres psql -U antenna -d antenna_db
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
netstat -ano | findstr :3000

# Or change port in docker-compose.yml
ports:
  - "3001:80"  # Use 3001 instead
```

### Service Won't Start

```bash
# Check service status
docker-compose ps

# View detailed logs
docker-compose logs solver

# Restart specific service
docker-compose restart solver
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
docker-compose exec postgres pg_isready -U antenna

# Check database
docker-compose exec postgres psql -U antenna -d antenna_db -c "\dt"
```

### MinIO Access Issues

```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# Re-initialize buckets
docker-compose up minio-init
```

## Production Deployment

### Security Hardening

1. **Change default passwords** in docker-compose.yml
2. **Use secrets management** for sensitive data
3. **Enable HTTPS** with Let's Encrypt
4. **Configure firewall rules**
5. **Set up monitoring** (Prometheus/Grafana)

### Performance Tuning

1. **Increase solver memory**: Adjust `deploy.resources.limits.memory` in docker-compose.yml
2. **Enable caching**: Configure Redis for API responses
3. **Scale services**: Use `docker-compose up -d --scale solver=3`

### Backup Strategy

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U antenna antenna_db > backup.sql

# Backup MinIO data
docker-compose exec minio mc mirror /data ./minio-backup
```

## Docker Compose Reference

```yaml
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# View running containers
docker-compose ps

# Scale service
docker-compose up -d --scale solver=3

# Update and restart
docker-compose pull
docker-compose up -d --force-recreate
```

## Health Checks

All services have health checks configured:

```bash
# Check all service health
docker-compose ps

# Manual health checks
curl http://localhost:8000/health
curl http://localhost:9000/minio/health/live
docker-compose exec postgres pg_isready -U antenna
```

## License

MIT
