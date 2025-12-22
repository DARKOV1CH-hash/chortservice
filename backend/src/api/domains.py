from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import UserInfo, require_admin, require_auth
from src.db.database import get_db
from src.schemas.domain import (
    DomainBulkCreate,
    DomainCreate,
    DomainListResponse,
    DomainResponse,
    DomainSearchFilters,
    DomainUpdate,
)
from src.services.domain_service import domain_service

router = APIRouter(prefix="/domains", tags=["domains"])


@router.post("", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
async def create_domain(
    domain_data: DomainCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create new domain (admin only)."""
    domain = await domain_service.create_domain(db, domain_data, user.email)
    return domain


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_domains(
    bulk_data: DomainBulkCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Bulk create domains from list (admin only).
    
    Returns created domains and list of skipped (already existing) domain names.
    """
    created, skipped = await domain_service.bulk_create_domains(
        db=db,
        domain_names=bulk_data.domains,
        description=bulk_data.description,
        tags=bulk_data.tags,
        user_email=user.email,
    )
    
    return {
        "created": len(created),
        "skipped": len(skipped),
        "skipped_domains": skipped,
        "domains": created,
    }


@router.get("", response_model=DomainListResponse)
async def list_domains(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = None,
    search: str | None = None,
    tags: list[str] = Query(None),
):
    """List all domains with pagination and filters."""
    from src.models.domain import DomainStatus
    
    filters = DomainSearchFilters(
        status=DomainStatus(status_filter) if status_filter else None,
        search=search,
        tags=tags if tags else None,
    )
    
    skip = (page - 1) * page_size
    domains, total = await domain_service.get_domains(
        db, skip=skip, limit=page_size, filters=filters
    )
    
    # Enrich with assignment info
    domain_responses = []
    for domain in domains:
        domain_dict = {
            **domain.__dict__,
            "assigned_server_id": domain.assignment.server_id if domain.assignment else None,
            "assigned_server_name": domain.assignment.server.name if domain.assignment else None,
        }
        # Parse tags from JSON
        if domain.tags:
            import json
            domain_dict["tags"] = json.loads(domain.tags)
        
        domain_responses.append(DomainResponse(**domain_dict))
    
    return DomainListResponse(
        domains=domain_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{domain_id}", response_model=DomainResponse)
async def get_domain(
    domain_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get domain by ID."""
    domain = await domain_service.get_domain(db, domain_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Enrich with assignment info
    domain_dict = {
        **domain.__dict__,
        "assigned_server_id": domain.assignment.server_id if domain.assignment else None,
        "assigned_server_name": domain.assignment.server.name if domain.assignment else None,
    }
    
    # Parse tags from JSON
    if domain.tags:
        import json
        domain_dict["tags"] = json.loads(domain.tags)
    
    return DomainResponse(**domain_dict)


@router.patch("/{domain_id}", response_model=DomainResponse)
async def update_domain(
    domain_id: int,
    domain_data: DomainUpdate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update domain (admin only)."""
    domain = await domain_service.update_domain(db, domain_id, domain_data, user.email)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    # Enrich response
    domain_dict = {
        **domain.__dict__,
        "assigned_server_id": domain.assignment.server_id if domain.assignment else None,
        "assigned_server_name": domain.assignment.server.name if domain.assignment else None,
    }
    
    if domain.tags:
        import json
        domain_dict["tags"] = json.loads(domain.tags)
    
    return DomainResponse(**domain_dict)


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(
    domain_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete domain (admin only). Cannot delete if assigned."""
    success = await domain_service.delete_domain(db, domain_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete assigned domain or domain not found"
        )


@router.post("/{domain_id}/lock")
async def lock_domain(
    domain_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lock domain for editing."""
    success = await domain_service.lock_domain(db, domain_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Domain is already locked by another user"
        )
    return {"message": "Domain locked successfully"}


@router.post("/{domain_id}/unlock")
async def unlock_domain(
    domain_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Unlock domain."""
    success = await domain_service.unlock_domain(db, domain_id, user.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this lock"
        )
    return {"message": "Domain unlocked successfully"}