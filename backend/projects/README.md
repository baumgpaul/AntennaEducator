# Projects Service

Project management and persistence API for the PEEC Antenna Simulator.

## Features

- **User Authentication**: JWT-based authentication with secure password hashing
- **Project Management**: Full CRUD operations for antenna design projects
- **Element Management**: Add and manage antenna elements (dipoles, loops, helices, etc.)
- **Results Storage**: Store and retrieve simulation results with frequency sweep support
- **MinIO Integration**: S3-compatible storage for mesh and current distribution data

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login and get access token
- `GET /api/v1/auth/me` - Get current user information

### Projects
- `POST /api/v1/projects` - Create new project
- `GET /api/v1/projects` - List user's projects
- `GET /api/v1/projects/:id` - Get project details
- `PUT /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Project Elements
- `POST /api/v1/projects/:id/elements` - Add element to project
- `DELETE /api/v1/projects/:id/elements/:element_id` - Remove element

### Results
- `POST /api/v1/projects/:id/results` - Save simulation result
- `GET /api/v1/projects/:id/results` - List project results

## Environment Variables

```bash
DATABASE_URL=postgresql://antenna:antenna123@postgres:5432/antenna_db
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=antenna-data
MINIO_SECURE=false
JWT_SECRET_KEY=your-secret-key-here
```

## Development

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Tests
```bash
pytest tests/ -v --cov
```

### Run Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8010
```

### Docker
```bash
docker-compose up projects
```

## API Documentation

Interactive API documentation available at:
- Swagger UI: http://localhost:8010/docs
- ReDoc: http://localhost:8010/redoc

## Test Coverage

- **97% overall coverage**
- 74 tests covering all endpoints
- Success, error, and authorization scenarios
- Integration tests for cascading operations

## Production Features

### Logging
- Structured logging with Python's logging module
- Console and file output (`projects_service.log`)
- Log levels: DEBUG, INFO, WARNING, ERROR
- Includes timestamps, module names, and stack traces

### Error Handling
- Database connection error handling with automatic rollback
- MinIO retry logic with exponential backoff (3 attempts)
- Graceful degradation for missing objects (returns None)
- Detailed error logging with context

### Reliability
- Database connection pooling with pre-ping validation
- Connection timeout (10 seconds)
- Automatic session cleanup
- Retry logic for transient network failures

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Protected routes with token validation
- User isolation (users can only access their own projects)
- Input validation with Pydantic
