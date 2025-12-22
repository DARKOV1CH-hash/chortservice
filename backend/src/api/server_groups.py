from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import UserInfo, require_admin, require_auth
from src.db.database import get_db
from src.schemas.server_group import (
    AssignServersToGroup,
    RemoveServersFromGroup,
    ServerGroupCreate,
    ServerGroupListResponse,
    ServerGroupResponse,
    ServerGroupUpdate,
    ServerGroupWithServers,
)
from src.services.server_group_service import server_group_service

router = APIRouter(prefix="/server-groups", tags=["server-groups"])


@router.post("", response_model=ServerGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group_data: ServerGroupCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create new server group (admin only)."""
    group = await server_group_service.create_group(db, group_data, user.email)

    return ServerGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        server_count=0,
        total_domains=0,
        total_capacity=0,
        created_at=group.created_at,
        updated_at=group.updated_at,
        created_by=group.created_by,
    )


@router.get("", response_model=ServerGroupListResponse)
async def list_groups(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all server groups with pagination."""
    skip = (page - 1) * page_size
    groups, total = await server_group_service.get_groups(db, skip=skip, limit=page_size)

    return ServerGroupListResponse(
        groups=[
            ServerGroupResponse(
                id=g.id,
                name=g.name,
                description=g.description,
                color=g.color,
                server_count=g.server_count,
                total_domains=g.total_domains,
                total_capacity=g.total_capacity,
                created_at=g.created_at,
                updated_at=g.updated_at,
                created_by=g.created_by,
            )
            for g in groups
        ],
        total=total,
    )


@router.get("/{group_id}", response_model=ServerGroupWithServers)
async def get_group(
    group_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get server group by ID with servers."""
    group = await server_group_service.get_group(db, group_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server group not found"
        )

    servers = [
        {
            "id": s.id,
            "name": s.name,
            "ip_address": s.ip_address,
            "current_domains": s.current_domains,
            "max_domains": s.max_domains,
            "is_locked": s.is_locked,
        }
        for s in group.servers
    ]

    return ServerGroupWithServers(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        server_count=group.server_count,
        total_domains=group.total_domains,
        total_capacity=group.total_capacity,
        created_at=group.created_at,
        updated_at=group.updated_at,
        created_by=group.created_by,
        servers=servers,
    )


@router.patch("/{group_id}", response_model=ServerGroupResponse)
async def update_group(
    group_id: int,
    group_data: ServerGroupUpdate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update server group (admin only)."""
    group = await server_group_service.update_group(db, group_id, group_data, user.email)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server group not found"
        )

    return ServerGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        server_count=group.server_count,
        total_domains=group.total_domains,
        total_capacity=group.total_capacity,
        created_at=group.created_at,
        updated_at=group.updated_at,
        created_by=group.created_by,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete server group (admin only). Servers will be ungrouped."""
    success = await server_group_service.delete_group(db, group_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server group not found"
        )


@router.post("/{group_id}/servers")
async def assign_servers(
    group_id: int,
    data: AssignServersToGroup,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Assign servers to a group (admin only)."""
    assigned, failed = await server_group_service.assign_servers_to_group(
        db, group_id, data.server_ids, user.email
    )

    if assigned == 0 and len(failed) == len(data.server_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or no valid servers"
        )

    return {
        "assigned": assigned,
        "failed": len(failed),
        "failed_server_ids": failed,
    }


@router.delete("/{group_id}/servers")
async def remove_servers(
    group_id: int,
    data: RemoveServersFromGroup,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove servers from a group (admin only)."""
    removed = await server_group_service.remove_servers_from_group(
        db, group_id, data.server_ids, user.email
    )

    return {
        "removed": removed,
    }


@router.get("/ungrouped/servers")
async def get_ungrouped_servers(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get servers not assigned to any group."""
    servers = await server_group_service.get_ungrouped_servers(db)

    return [
        {
            "id": s.id,
            "name": s.name,
            "ip_address": s.ip_address,
            "current_domains": s.current_domains,
            "max_domains": s.max_domains,
            "is_locked": s.is_locked,
        }
        for s in servers
    ]
