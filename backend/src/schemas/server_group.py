from datetime import datetime

from pydantic import BaseModel, Field


class ServerGroupBase(BaseModel):
    """Base server group schema."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ServerGroupCreate(ServerGroupBase):
    """Schema for creating server group."""
    pass


class ServerGroupUpdate(BaseModel):
    """Schema for updating server group."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ServerGroupResponse(ServerGroupBase):
    """Schema for server group response."""
    id: int
    server_count: int = 0
    total_domains: int = 0
    total_capacity: int = 0
    created_at: datetime
    updated_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class ServerGroupListResponse(BaseModel):
    """Schema for server group list response."""
    groups: list[ServerGroupResponse]
    total: int


class ServerGroupWithServers(ServerGroupResponse):
    """Schema for server group with server list."""
    servers: list[dict] = []  # List of server summaries

    class Config:
        from_attributes = True


class AssignServersToGroup(BaseModel):
    """Schema for assigning servers to a group."""
    server_ids: list[int] = Field(..., min_length=1)


class RemoveServersFromGroup(BaseModel):
    """Schema for removing servers from a group."""
    server_ids: list[int] = Field(..., min_length=1)
