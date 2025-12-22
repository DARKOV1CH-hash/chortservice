from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.models.server import CapacityMode, ServerStatus


class ServerBase(BaseModel):
    """Base server schema."""
    name: str = Field(..., min_length=1, max_length=255)
    ip_address: str = Field(..., min_length=7, max_length=45)
    capacity_mode: CapacityMode = CapacityMode.MODE_1_5
    is_central_config: bool = True
    individual_config: str | None = None
    central_config: str | None = None
    description: str | None = None


class ServerCreate(ServerBase):
    """Schema for creating server."""
    
    @field_validator("capacity_mode", mode="before")
    @classmethod
    def set_max_domains(cls, v):
        """Set max_domains based on capacity_mode."""
        return v


class ServerUpdate(BaseModel):
    """Schema for updating server."""
    name: str | None = Field(None, min_length=1, max_length=255)
    ip_address: str | None = Field(None, min_length=7, max_length=45)
    capacity_mode: CapacityMode | None = None
    is_central_config: bool | None = None
    individual_config: str | None = None
    central_config: str | None = None
    description: str | None = None
    status: ServerStatus | None = None


class ServerResponse(ServerBase):
    """Schema for server response."""
    id: int
    status: ServerStatus
    max_domains: int
    current_domains: int
    created_at: datetime
    updated_at: datetime
    created_by: str
    locked_by: str | None = None
    locked_at: datetime | None = None

    class Config:
        from_attributes = True


class ServerListResponse(BaseModel):
    """Schema for server list response."""
    servers: list[ServerResponse]
    total: int
    page: int
    page_size: int


class ServerWithAssignments(ServerResponse):
    """Schema for server with domain assignments."""
    assigned_domains: list[str] = []  # List of domain names

    class Config:
        from_attributes = True