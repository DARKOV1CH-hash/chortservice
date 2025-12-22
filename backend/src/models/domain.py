from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base


class DomainStatus(str, Enum):
    """Domain status."""
    FREE = "free"
    ASSIGNED = "assigned"


class Domain(Base):
    """Domain model."""
    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    
    # Status
    status: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default=DomainStatus.FREE.value,
        index=True
    )
    
    # Metadata
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(String(500), nullable=True)  # JSON array
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    locked_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    assignment: Mapped["Assignment | None"] = relationship(
        "Assignment", 
        back_populates="domain",
        uselist=False
    )

    @property
    def is_assigned(self) -> bool:
        """Check if domain is assigned to a server."""
        return self.status == DomainStatus.ASSIGNED.value