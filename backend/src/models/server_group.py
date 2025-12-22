from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base


class ServerGroup(Base):
    """Server group model for organizing servers."""
    __tablename__ = "server_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # Hex color like #FF5733

    # Metadata
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

    # Relationships
    servers: Mapped[list["Server"]] = relationship(
        "Server",
        back_populates="group",
        foreign_keys="Server.group_id"
    )

    @property
    def server_count(self) -> int:
        """Get number of servers in this group."""
        return len(self.servers) if self.servers else 0

    @property
    def total_domains(self) -> int:
        """Get total domains across all servers in group."""
        return sum(s.current_domains for s in self.servers) if self.servers else 0

    @property
    def total_capacity(self) -> int:
        """Get total capacity across all servers in group."""
        return sum(s.max_domains for s in self.servers) if self.servers else 0
