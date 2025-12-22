from datetime import datetime

from pydantic import BaseModel, Field

from src.models.domain import DomainStatus


class DomainBase(BaseModel):
    """Base domain schema."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] | None = None


class DomainCreate(DomainBase):
    """Schema for creating domain."""
    pass


class DomainBulkCreate(BaseModel):
    """Schema for bulk domain creation."""
    domains: list[str] = Field(..., min_items=1)
    description: str | None = None
    tags: list[str] | None = None


class DomainUpdate(BaseModel):
    """Schema for updating domain."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] | None = None
    status: DomainStatus | None = None


class DomainResponse(DomainBase):
    """Schema for domain response."""
    id: int
    status: DomainStatus
    created_at: datetime
    updated_at: datetime
    created_by: str
    locked_by: str | None = None
    locked_at: datetime | None = None
    assigned_server_id: int | None = None
    assigned_server_name: str | None = None

    class Config:
        from_attributes = True


class DomainListResponse(BaseModel):
    """Schema for domain list response."""
    domains: list[DomainResponse]
    total: int
    page: int
    page_size: int


class DomainSearchFilters(BaseModel):
    """Schema for domain search filters."""
    status: DomainStatus | None = None
    tags: list[str] | None = None
    search: str | None = None
    assigned_server_id: int | None = None