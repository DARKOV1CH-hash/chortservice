import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.api import assignments, domains, server_groups, servers, websocket
from src.auth.dependencies import setup_oauth
from src.config import get_settings
from src.db.database import init_db
from src.redis.client import close_redis, redis_service

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger(__name__)
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Domain and Server Management System with Real-time Updates",
    version="1.0.0",
    debug=settings.debug,
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.authentik_client_secret or "dev-secret-key",
    max_age=86400,  # 24 hours
)

# Setup OAuth
setup_oauth()

# Include routers
app.include_router(servers.router, prefix="/api/v1")
app.include_router(server_groups.router, prefix="/api/v1")
app.include_router(domains.router, prefix="/api/v1")
app.include_router(assignments.router, prefix="/api/v1")
app.include_router(websocket.router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logger.info("Starting application", app=settings.app_name)
    
    # Initialize database
    await init_db()
    logger.info("Database initialized")
    
    # Initialize Redis
    await redis_service.initialize()
    logger.info("Redis initialized")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down application")
    
    # Close Redis connection
    await close_redis()
    logger.info("Redis connection closed")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "ok",
        "redis": "ok",
    }


# OAuth routes for authentication
if not settings.dev_mode and settings.authentik_issuer:
    from authlib.integrations.starlette_client import OAuth
    from fastapi import Request
    from starlette.responses import RedirectResponse
    
    from src.auth.dependencies import oauth
    
    @app.get("/auth/login")
    async def login(request: Request):
        """Initiate OAuth login."""
        redirect_uri = request.url_for("auth_callback")
        return await oauth.authentik.authorize_redirect(request, redirect_uri)
    
    @app.get("/auth/callback")
    async def auth_callback(request: Request):
        """OAuth callback handler."""
        try:
            token = await oauth.authentik.authorize_access_token(request)
            user_info = token.get("userinfo")
            
            if user_info:
                request.session["user"] = user_info
                logger.info("User logged in", user=user_info.get("email"))
            
            return RedirectResponse(url="/")
        except Exception as e:
            logger.error("OAuth callback error", error=str(e))
            return RedirectResponse(url="/auth/login")
    
    @app.get("/auth/logout")
    async def logout(request: Request):
        """Logout user."""
        request.session.clear()
        return RedirectResponse(url="/")


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info",
    )