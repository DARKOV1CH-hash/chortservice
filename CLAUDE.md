# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chortline Domain Manager - A full-stack application for domain and server management with real-time updates. The system uses a monorepo structure with separate frontend and backend services, designed to run via Docker Compose.

## Architecture

**Backend (Python/FastAPI)** - `backend/`
- FastAPI application with async SQLAlchemy and PostgreSQL
- Redis for caching and pub/sub (real-time WebSocket updates)
- Casbin for authorization
- Authentik OAuth2 for authentication (bypassed in dev mode)
- Alembic for database migrations

**Frontend (Next.js)** - `frontend/chortservice/`
- Next.js 16 with App Router (`app/` directory)
- React 19, TypeScript, Tailwind CSS 4
- Path alias: `@/*` maps to project root
- Real-time updates via WebSocket

## Commands

### Development (Docker)
```bash
docker-compose up           # Start all services
docker-compose up -d        # Start in background
docker-compose logs -f      # View logs
```

### Backend (standalone)
```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Frontend (standalone)
```bash
cd frontend/chortservice
npm install
npm run dev                 # Development server on port 3000
npm run build               # Production build
npm run lint                # ESLint
```

### Backend Testing & Quality
```bash
cd backend
pytest                      # Run all tests
pytest tests/test_server.py # Run specific test file
pytest -v                   # Verbose output
black .                     # Format code
ruff check .                # Lint
mypy .                      # Type checking
```

### Database Migrations
```bash
cd backend
alembic revision --autogenerate -m "description"  # Create migration
alembic upgrade head                               # Apply migrations
```

## Backend Structure

```
backend/src/
├── api/          # FastAPI route handlers (servers, domains, assignments, websocket)
├── auth/         # OAuth2/Authentik authentication
├── casbin/       # RBAC authorization with Casbin
├── db/           # SQLAlchemy database setup
├── models/       # SQLAlchemy ORM models (server, domain, assignment)
├── redis/        # Redis client for caching and pub/sub
├── schemas/      # Pydantic request/response schemas
├── services/     # Business logic layer
├── config.py     # Pydantic Settings configuration
└── main.py       # FastAPI app entry point
```

## Frontend Structure

```
frontend/chortservice/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard
│   ├── servers/page.tsx   # Server management
│   ├── domains/page.tsx   # Domain management
│   ├── assignments/page.tsx # Assignments & exports
│   ├── layout.tsx         # Root layout with navigation
│   └── globals.css        # Global styles
├── components/            # Reusable UI components
│   ├── Navigation.tsx     # Main navigation bar
│   └── ui.tsx             # Button, Input, Modal, Table, etc.
├── hooks/                 # React hooks
│   └── useWebSocket.ts    # WebSocket connection & real-time updates
└── lib/                   # Utilities
    ├── api.ts             # API client (serverApi, domainApi, assignmentApi)
    ├── types.ts           # TypeScript type definitions
    └── websocket.ts       # WebSocket client with auto-reconnect
```

## WebSocket Channels

Real-time updates via `/api/v1/ws`:
- `servers` - Server CRUD notifications
- `domains` - Domain CRUD notifications
- `assignments` - Assignment changes
- `locks` - Resource lock notifications

## Environment Variables

Backend uses `.env` file (see `backend/.env.example`):
- `DEV_MODE=true` bypasses authentication
- `DEV_USER_ROLE=admin|user` sets dev mode permissions

Frontend uses `.env.local`:
- `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `NEXT_PUBLIC_WS_URL=ws://localhost:8000`

## Ports

- Frontend: 3000
- Backend API: 8000
- PostgreSQL: 5432
- Redis: 6379
