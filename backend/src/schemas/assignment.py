from datetime import datetime

from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    """Schema for creating assignment."""
    domain_id: int = Field(..., gt=0)
    server_id: int = Field(..., gt=0)


class AssignmentBulkCreate(BaseModel):
    """Schema for bulk assignment creation."""
    domain_ids: list[int] = Field(..., min_items=1)
    server_id: int = Field(..., gt=0)


class AssignmentAutoCreate(BaseModel):
    """Schema for automatic assignment."""
    domain_ids: list[int] = Field(..., min_items=1)
    capacity_mode: str | None = None  # Optional override
    distribute_evenly: bool = True


class AssignmentResponse(BaseModel):
    """Schema for assignment response."""
    id: int
    domain_id: int
    domain_name: str
    server_id: int
    server_name: str
    assigned_at: datetime
    assigned_by: str

    class Config:
        from_attributes = True


class AssignmentDeleteResponse(BaseModel):
    """Schema for assignment deletion response."""
    success: bool
    message: str
    domain_id: int
    server_id: int


class AssignmentStatsResponse(BaseModel):
    """Schema for assignment statistics."""
    total_servers: int
    total_domains: int
    assigned_domains: int
    free_domains: int
    servers_in_use: int
    servers_free: int
    average_load: float
    capacity_utilization: dict[str, dict[str, int]]  # By capacity mode