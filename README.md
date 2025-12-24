# ChortDomains - Startup Guide

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

## Quick Start with Docker

### 1. Start All Services

```bash
cd /path/to/myservice
docker-compose up -d
```

This starts:
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- Backend API (port 8000)
- Frontend (port 3000)

### 2. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### 3. View Logs

```bash
docker-compose logs -f           # All services
docker-compose logs -f backend   # Backend only
docker-compose logs -f frontend  # Frontend only
```

### 4. Stop Services

```bash
docker-compose down              # Stop containers
docker-compose down -v           # Stop and remove volumes (resets data)
```

## Local Development Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env

# Start PostgreSQL and Redis (via Docker)
docker-compose up -d postgres redis

# Run database migrations
alembic upgrade head

# Start development server
uvicorn src.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend/chortdomains

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> .env.local

# Start development server
npm run dev
```

## Environment Configuration

### Backend (.env)

Key settings for development:
```env
DEV_MODE=true           # Bypass authentication
DEV_USER_ROLE=admin     # admin or user
DEBUG=true              # Enable debug mode
```

Key settings for production:
```env
DEV_MODE=false
AUTHENTIK_ISSUER=https://your-auth-server/application/o/app/
AUTHENTIK_CLIENT_ID=your-client-id
AUTHENTIK_CLIENT_SECRET=your-client-secret
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Application Features

### Dashboard
- Overview statistics (servers, domains, assignments)
- Capacity utilization by mode
- Recent servers and domains

### Servers Management
- Create, edit, delete servers
- Configure capacity modes (1:5, 1:7, 1:10)
- View assigned domains
- Lock/unlock servers for editing

### Domains Management
- Create single or bulk import domains
- Tag-based organization
- Assign domains to servers (manual or auto-distribute)
- Search and filter domains

### Assignments
- View capacity report across all servers
- Export assignments in Domain Hub format
- Export as CSV
- Clear all assignments from a server

## WebSocket Real-time Updates

The frontend connects to the backend via WebSocket for real-time updates. Changes made by one user are instantly reflected for all connected users.

Channels:
- `servers` - Server CRUD operations
- `domains` - Domain CRUD operations
- `assignments` - Assignment changes
- `locks` - Resource lock notifications

## API Endpoints

### Servers
- `GET /api/v1/servers` - List servers
- `POST /api/v1/servers` - Create server
- `GET /api/v1/servers/{id}` - Get server details
- `PATCH /api/v1/servers/{id}` - Update server
- `DELETE /api/v1/servers/{id}` - Delete server
- `POST /api/v1/servers/{id}/lock` - Lock server
- `POST /api/v1/servers/{id}/unlock` - Unlock server

### Domains
- `GET /api/v1/domains` - List domains
- `POST /api/v1/domains` - Create domain
- `POST /api/v1/domains/bulk` - Bulk create domains
- `GET /api/v1/domains/{id}` - Get domain
- `PATCH /api/v1/domains/{id}` - Update domain
- `DELETE /api/v1/domains/{id}` - Delete domain

### Assignments
- `POST /api/v1/assignments` - Create assignment
- `POST /api/v1/assignments/bulk` - Bulk assign
- `POST /api/v1/assignments/auto` - Auto-assign
- `DELETE /api/v1/assignments/{id}` - Delete assignment
- `GET /api/v1/assignments/stats` - Get statistics
- `GET /api/v1/assignments/export/domain-hub` - Export Domain Hub format
- `GET /api/v1/assignments/export/csv` - Export CSV

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres
```

### Redis Connection Issues
```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping
```

### Frontend Build Errors
```bash
cd frontend/chortdomains
rm -rf node_modules .next
npm install
npm run build
```

### Reset Everything
```bash
docker-compose down -v
docker-compose up -d
```

## Running Tests

### Backend Tests
```bash
cd backend
pytest                          # Run all tests
pytest -v                       # Verbose output
pytest tests/test_server.py     # Specific test file
pytest --cov=src               # With coverage
```

### Backend Code Quality
```bash
cd backend
black .                         # Format code
ruff check .                    # Lint
mypy .                          # Type check
```

### Frontend Linting
```bash
cd frontend/chortdomains
npm run lint
```
