from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base


class CapacityMode(str, Enum):
    """Server capacity mode."""
    MODE_1_5 = "1:5"
    MODE_1_7 = "1:7"
    MODE_1_10 = "1:10"


class ServerStatus(str, Enum):
    """Server status."""
    FREE = "free"
    IN_USE = "in_use"


class Server(Base):
    """Server model."""
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    
    # Status
    status: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default=ServerStatus.FREE.value,
        index=True
    )
    
    # Capacity
    capacity_mode: Mapped[str] = mapped_column(
        String(10), 
        nullable=False, 
        default=CapacityMode.MODE_1_5.value
    )
    max_domains: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    current_domains: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Config
    is_central_config: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    individual_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    central_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Metadata
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment", 
        back_populates="server",
        cascade="all, delete-orphan"
    )

    @property
    def is_full(self) -> bool:
        """Check if server reached max capacity."""
        return self.current_domains >= self.max_domains

    @property
    def available_slots(self) -> int:
        """Get number of available slots."""
        return max(0, self.max_domains - self.current_domains)