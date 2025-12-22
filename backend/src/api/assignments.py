from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import UserInfo, require_admin, require_auth
from src.db.database import get_db
from src.schemas.assignment import (
    AssignmentAutoCreate,
    AssignmentBulkCreate,
    AssignmentCreate,
    AssignmentResponse,
    AssignmentStatsResponse,
)
from src.services.assignment_service import assignment_service
from src.services.export_service import export_service

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    assignment_data: AssignmentCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create manual assignment between domain and server (admin only)."""
    from src.models.domain import Domain
    from src.models.server import Server

    assignment = await assignment_service.create_assignment(
        db=db,
        domain_id=assignment_data.domain_id,
        server_id=assignment_data.server_id,
        user_email=user.email,
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create assignment. Server may be full or domain already assigned."
        )

    # Fetch related objects for response
    domain = await db.get(Domain, assignment.domain_id)
    server = await db.get(Server, assignment.server_id)

    return AssignmentResponse(
        id=assignment.id,
        domain_id=assignment.domain_id,
        domain_name=domain.name,
        server_id=assignment.server_id,
        server_name=server.name,
        assigned_at=assignment.assigned_at,
        assigned_by=assignment.assigned_by,
    )


async def _build_assignment_responses(
    db: AsyncSession,
    assignments: list,
) -> list[AssignmentResponse]:
    """Build assignment response objects with related data."""
    from src.models.domain import Domain
    from src.models.server import Server

    responses = []
    for assignment in assignments:
        domain = await db.get(Domain, assignment.domain_id)
        server = await db.get(Server, assignment.server_id)
        responses.append(AssignmentResponse(
            id=assignment.id,
            domain_id=assignment.domain_id,
            domain_name=domain.name if domain else "",
            server_id=assignment.server_id,
            server_name=server.name if server else "",
            assigned_at=assignment.assigned_at,
            assigned_by=assignment.assigned_by,
        ))
    return responses


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_assignments(
    bulk_data: AssignmentBulkCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Bulk assign domains to a single server (admin only).

    Returns created assignments and list of failed domain IDs.
    """
    assignments, failed = await assignment_service.bulk_assign(
        db=db,
        domain_ids=bulk_data.domain_ids,
        server_id=bulk_data.server_id,
        user_email=user.email,
    )

    assignment_responses = await _build_assignment_responses(db, assignments)

    return {
        "success": len(assignments),
        "failed": len(failed),
        "failed_domain_ids": failed,
        "assignments": assignment_responses,
    }


@router.post("/auto", status_code=status.HTTP_201_CREATED)
async def auto_create_assignments(
    auto_data: AssignmentAutoCreate,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Automatically assign domains to servers with even distribution (admin only).

    Distributes domains evenly across available servers based on capacity.
    """
    from src.models.server import CapacityMode

    capacity_mode = None
    if auto_data.capacity_mode:
        capacity_mode = CapacityMode(auto_data.capacity_mode)

    assignments, failed = await assignment_service.auto_assign(
        db=db,
        domain_ids=auto_data.domain_ids,
        user_email=user.email,
        capacity_mode=capacity_mode,
        distribute_evenly=auto_data.distribute_evenly,
    )

    assignment_responses = await _build_assignment_responses(db, assignments)

    return {
        "success": len(assignments),
        "failed": len(failed),
        "failed_domain_ids": failed,
        "assignments": assignment_responses,
        "servers_used": len(set(a.server_id for a in assignments)),
    }


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete assignment and free up resources (admin only)."""
    success = await assignment_service.delete_assignment(
        db=db,
        assignment_id=assignment_id,
        user_email=user.email,
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )


@router.delete("/domain/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain_assignments(
    domain_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete all assignments for a domain (admin only)."""
    success = await assignment_service.delete_assignments_by_domain(
        db=db,
        domain_id=domain_id,
        user_email=user.email,
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No assignments found for this domain"
        )


@router.delete("/server/{server_id}", status_code=status.HTTP_200_OK)
async def delete_server_assignments(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete all assignments for a server (admin only)."""
    count = await assignment_service.delete_assignments_by_server(
        db=db,
        server_id=server_id,
        user_email=user.email,
    )
    
    return {
        "message": f"Deleted {count} assignments",
        "count": count,
    }


@router.get("/stats", response_model=AssignmentStatsResponse)
async def get_statistics(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get assignment statistics."""
    stats = await assignment_service.get_statistics(db)
    return stats


@router.get("/export/domain-hub")
async def export_domain_hub(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
    server_id: int | None = None,
):
    """
    Export assignments in Domain Hub format.
    
    Format:
    [server_ip]
    domain1.com
    domain2.com
    """
    export_text = await export_service.export_to_domain_hub(db, server_id)
    
    return Response(
        content=export_text,
        media_type="text/plain",
        headers={
            "Content-Disposition": f"attachment; filename=domain-hub-export.txt"
        }
    )


@router.get("/export/csv")
async def export_csv(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Export all assignments as CSV."""
    csv_text = await export_service.export_all_assignments_csv(db)
    
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=assignments.csv"
        }
    )


@router.get("/export/capacity-report")
async def export_capacity_report(
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate capacity utilization report."""
    report = await export_service.export_capacity_report(db)
    return report


@router.get("/export/server/{server_id}")
async def export_server_config(
    server_id: int,
    user: Annotated[UserInfo, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Export server configuration with assigned domains."""
    config = await export_service.export_server_config(db, server_id)
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    return config