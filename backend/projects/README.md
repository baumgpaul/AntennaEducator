# Projects Service

Workspace persistence layer for the Antenna Simulator.  Stores project
metadata and JSON blobs (design state, simulation config, results, UI
state) in DynamoDB.  Large simulation results and documentation content
live in S3 and are referenced by keys.

## DynamoDB Single-Table Design

| PK | SK | Purpose |
|----|----|----|
| `USER#{user_id}` | `PROJECT#{project_id}` | Project item |
| `USER#{user_id}` | `FOLDER#{folder_id}` | Folder item |
| `USER#{user_id}` | `METADATA` | User profile |
| `COURSE#{course_id}` | `SUBMISSION#{submission_id}` | Course submission |
| `COURSE#{course_id}` | `ENROLLMENT#{user_id}` | Course enrollment |

GSI1 (`GSI1PK` / `GSI1SK`) enables lookup by project ID or folder ID
without knowing the user.

## Project Data Model

Each project stores four JSON blob columns plus metadata:

| Field | Purpose |
|-------|---------|
| `design_state` | Full snapshot: elements, sources, positions, version |
| `simulation_config` | Solver settings: method, frequency, requested fields |
| `simulation_results` | Solver output summary + S3 `result_keys` references |
| `ui_state` | Frontend-only: tabs, camera, view configs |
| `documentation` | Metadata only: `has_content`, `image_keys`, preview |

## Folder & Course Hierarchy

- **User folders**: personal organizers, CRUD by owner only.
- **Course folders**: public, created by maintainers/admins.
  Deep-copy clones the entire tree (folders + projects + docs) into a
  student's personal space.
- Folder moves include **cycle detection** to prevent A→B→A loops.

## Submission Lifecycle

1. Student submits → frozen snapshot stored (`submitted`)
2. Instructor reviews → adds feedback (`reviewed` / `returned`)
3. Frozen blobs are immutable after submission.

## Documentation Service

S3-backed markdown + image storage under
`projects/{project_id}/documentation/`.

- **Image keys**: `img_<12 hex>.<ext>` — only `.png`, `.jpg`, `.jpeg`,
  `.gif`, `.svg`, `.webp` accepted.
- Presigned PUT URLs for direct upload (bypasses Lambda 6 MB limit).
- Content preview (≤200 chars) stored in DynamoDB for list views.

## API Endpoints

### Projects (`main.py`)
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/projects` | owner |
| GET | `/api/projects` | owner |
| GET | `/api/projects/{id}` | owner / maintainer |
| PUT | `/api/projects/{id}` | owner / maintainer |
| DELETE | `/api/projects/{id}` | owner / maintainer |
| POST | `/api/projects/{id}/duplicate` | owner |
| POST | `/api/projects/{id}/reset` | owner |

### Documentation (`main.py`)
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/projects/{id}/documentation` | owner |
| PUT | `/api/projects/{id}/documentation` | owner |
| POST | `/api/projects/{id}/documentation/images` | owner |
| GET | `/api/projects/{id}/documentation/images/{key}` | owner |
| DELETE | `/api/projects/{id}/documentation/images/{key}` | owner |

### Folders & Courses (`folder_routes.py`)
| Method | Path | Auth |
|--------|------|------|
| POST/GET/PUT/DELETE | `/api/folders[/{id}]` | owner |
| POST/GET/PUT/DELETE | `/api/courses[/{id}]` | maintainer+ |
| POST | `/api/courses/{id}/copy` | any authenticated |
| POST | `/api/courses/projects/{id}/copy` | any authenticated |

### Admin (`folder_routes.py`)
| Method | Path | Auth |
|--------|------|------|
| PUT | `/api/admin/users/{id}/role` | admin |
| GET | `/api/admin/users` | admin |
| PUT | `/api/admin/users/{id}/tokens` | admin |
| PUT | `/api/admin/users/{id}/flatrate` | admin |
| PUT | `/api/admin/users/{id}/lock` | admin |

### Submissions (`submission_routes.py`)
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/courses/{id}/submissions` | enrolled student |
| GET | `/api/my-submissions` | any authenticated |
| GET | `/api/courses/{id}/submissions` | maintainer (all) / student (own) |
| GET | `/api/courses/{id}/submissions/{sid}` | maintainer / owner |
| PATCH | `/api/courses/{id}/submissions/{sid}/review` | maintainer+ |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `USE_DYNAMODB` | `true` (always) — selects DynamoDB repository |
| `DYNAMODB_TABLE_NAME` | Table name (default `antenna-simulator-staging`) |
| `RESULTS_BUCKET_NAME` | S3 bucket for results and documentation |
| `S3_ENDPOINT_URL` | MinIO endpoint for local dev |
| `AWS_REGION` | AWS region (default `eu-west-1`) |

## Development

```bash
# Run locally (from repo root, venv activated)
uvicorn backend.projects.main:app --port 8010 --reload

# Run tests
pytest tests/unit/ -k "project or folder or submission or documentation" -v
```

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
