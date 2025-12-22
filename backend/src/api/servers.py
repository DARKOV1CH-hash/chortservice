from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import UserInfo, require_admin, require_auth
from src.db.database import get_db
from src.models.server import ServerStatus
from src.schemas.server import (
    ServerBulkCreate,
    ServerBulkCreateResponse,
    ServerCreate,
    ServerListResponse,
    ServerResponse,
    ServerUpdate,
    ServerWithAssignments,
)
from src.services.server_service import server_service

router = APIRouter(prefix="/servers", tags=["servers"])


@router.post("", response_model=ServerResponse, status_code=status.HTTP_201_CREATED)
async def create_server(
    server_data: ServerCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create new server (admin only)."""
    server = await server_service.create_server(db, server_data, user.email)
    return server


@router.post("/bulk", response_model=ServerBulkCreateResponse, status_code=status.HTTP_201_CREATED)
async def bulk_create_servers(
    bulk_data: ServerBulkCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Bulk create servers (admin only).

    Each line in servers list can be:
    - "IP password" - IP address with password
    - "IP" - IP address without password

    Example input: ["38.180.129.110 3o4cuMcKSF", "192.168.1.1"]
    """
    created, skipped = await server_service.bulk_create_servers(
        db=db,
        servers_data=bulk_data.servers,
        capacity_mode=bulk_data.capacity_mode,
        description=bulk_data.description,
        user_email=user.email,
    )

    return ServerBulkCreateResponse(
        created=len(created),
        skipped=len(skipped),
        skipped_ips=skipped,
        servers=created,
    )


def _build_server_response(server) -> ServerResponse:
    """Build server response with group name."""
    return ServerResponse(
        id=server.id,
        name=server.name,
        ip_address=server.ip_address,
        status=server.status,
        capacity_mode=server.capacity_mode,
        max_domains=server.max_domains,
        current_domains=server.current_domains,
        is_central_config=server.is_central_config,
        individual_config=server.individual_config,
        central_config=server.central_config,
        description=server.description,
        password=server.password,
        is_locked=server.is_locked,
        group_id=server.group_id,
        group_name=server.group.name if server.group else None,
        created_at=server.created_at,
        updated_at=server.updated_at,
        created_by=server.created_by,
        locked_by=server.locked_by,
        locked_at=server.locked_at,
    )


@router.get("", response_model=ServerListResponse)
async def list_servers(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: ServerStatus | None = None,
    group_id: int | None = None,
):
    """List all servers with pagination."""
    skip = (page - 1) * page_size
    servers, total = await server_service.get_servers(
        db, skip=skip, limit=page_size, status=status_filter, group_id=group_id
    )

    return ServerListResponse(
        servers=[_build_server_response(s) for s in servers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{server_id}", response_model=ServerWithAssignments)
async def get_server(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get server by ID with assignments."""
    server = await server_service.get_server(db, server_id)
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    assigned_domains = [a.domain.name for a in server.assignments]
    
    return ServerWithAssignments(
        **server.__dict__,
        assigned_domains=assigned_domains,
    )


@router.patch("/{server_id}", response_model=ServerResponse)
async def update_server(
    server_id: int,
    server_data: ServerUpdate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update server (admin only)."""
    server = await server_service.update_server(db, server_id, server_data, user.email)
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    return server


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete server (admin only). Cannot delete if has assignments."""
    success = await server_service.delete_server(db, server_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete server with assignments or server not found"
        )


@router.post("/{server_id}/lock")
async def lock_server(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lock server for editing."""
    success = await server_service.lock_server(db, server_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Server is already locked by another user"
        )
    return {"message": "Server locked successfully"}


@router.post("/{server_id}/toggle-lock", response_model=ServerResponse)
async def toggle_server_lock(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Toggle server lock to prevent/allow domain assignments (admin only)."""
    server = await server_service.toggle_lock(db, server_id, user.email)
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    return server


@router.post("/{server_id}/unlock")
async def unlock_server(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Unlock server."""
    success = await server_service.unlock_server(db, server_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this lock"
        )
    return {"message": "Server unlocked successfully"}


@router.get("/available/list", response_model=list[ServerResponse])
async def list_available_servers(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get list of servers with available capacity."""
    servers = await server_service.get_available_servers(db)
    return servers
