from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base


class Assignment(Base):
    """Domain-Server assignment model."""
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("domain_id", name="uq_domain_assignment"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    domain_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    server_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Metadata
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    assigned_by: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Relationships
    domain: Mapped["Domain"] = relationship("Domain", back_populates="assignment")
    server: Mapped["Server"] = relationship("Server", back_populates="assignments")