import json
from datetime import datetime

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.assignment import Assignment
from src.models.domain import Domain, DomainStatus
from src.redis.client import redis_service
from src.schemas.domain import DomainCreate, DomainSearchFilters, DomainUpdate

logger = structlog.get_logger(__name__)


class DomainService:
    """Service for managing domains."""

    async def create_domain(
        self,
        db: AsyncSession,
        domain_data: DomainCreate,
        user_email: str,
    ) -> Domain:
        """Create new domain."""
        tags_json = json.dumps(domain_data.tags) if domain_data.tags else None
        
        domain = Domain(
            name=domain_data.name,
            description=domain_data.description,
            tags=tags_json,
            created_by=user_email,
        )
        
        db.add(domain)
        await db.flush()
        
        logger.info(
            "Domain created",
            domain_id=domain.id,
            name=domain.name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("domains", {
            "action": "created",
            "domain_id": domain.id,
            "domain_name": domain.name,
            "user": user_email,
        })
        
        return domain

    async def bulk_create_domains(
        self,
        db: AsyncSession,
        domain_names: list[str],
        description: str | None,
        tags: list[str] | None,
        user_email: str,
    ) -> tuple[list[Domain], list[str]]:
        """
        Bulk create domains.
        
        Returns:
            Tuple of (created_domains, skipped_names)
        """
        tags_json = json.dumps(tags) if tags else None
        
        # Check existing domains
        result = await db.execute(
            select(Domain.name).where(Domain.name.in_(domain_names))
        )
        existing_names = set(result.scalars().all())
        
        # Filter out existing
        new_names = [name for name in domain_names if name not in existing_names]
        
        # Create new domains
        domains = []
        for name in new_names:
            domain = Domain(
                name=name,
                description=description,
                tags=tags_json,
                created_by=user_email,
            )
            domains.append(domain)
        
        if domains:
            db.add_all(domains)
            await db.flush()
            
            logger.info(
                "Bulk domains created",
                count=len(domains),
                skipped=len(existing_names),
                user=user_email
            )
            
            # Publish event
            await redis_service.publish("domains", {
                "action": "bulk_created",
                "count": len(domains),
                "skipped": len(existing_names),
                "user": user_email,
            })
        
        return domains, list(existing_names)

    async def get_domain(self, db: AsyncSession, domain_id: int) -> Domain | None:
        """Get domain by ID."""
        result = await db.execute(
            select(Domain)
            .where(Domain.id == domain_id)
            .options(
                selectinload(Domain.assignment).selectinload(Assignment.server)
            )
        )
        return result.scalar_one_or_none()

    async def get_domains(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        filters: DomainSearchFilters | None = None,
    ) -> tuple[list[Domain], int]:
        """Get list of domains with pagination and filters."""
        query = select(Domain).options(
            selectinload(Domain.assignment).selectinload(Assignment.server)
        )
        
        if filters:
            if filters.status:
                query = query.where(Domain.status == filters.status.value)
            
            if filters.search:
                search_pattern = f"%{filters.search}%"
                query = query.where(
                    or_(
                        Domain.name.ilike(search_pattern),
                        Domain.description.ilike(search_pattern),
                    )
                )
            
            if filters.tags:
                # Search in JSON tags
                for tag in filters.tags:
                    query = query.where(Domain.tags.contains(tag))
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = await db.scalar(count_query)
        
        # Get paginated results
        query = query.offset(skip).limit(limit).order_by(Domain.created_at.desc())
        result = await db.execute(query)
        domains = result.scalars().all()
        
        return list(domains), total or 0

    async def update_domain(
        self,
        db: AsyncSession,
        domain_id: int,
        domain_data: DomainUpdate,
        user_email: str,
    ) -> Domain | None:
        """Update domain."""
        domain = await self.get_domain(db, domain_id)
        if not domain:
            return None
        
        update_data = domain_data.model_dump(exclude_unset=True)
        
        # Handle tags JSON conversion
        if "tags" in update_data:
            tags = update_data.pop("tags")
            update_data["tags"] = json.dumps(tags) if tags else None
        
        for field, value in update_data.items():
            setattr(domain, field, value)
        
        domain.updated_at = datetime.utcnow()
        await db.flush()
        
        logger.info(
            "Domain updated",
            domain_id=domain.id,
            changes=list(update_data.keys()),
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("domains", {
            "action": "updated",
            "domain_id": domain.id,
            "domain_name": domain.name,
            "changes": list(update_data.keys()),
            "user": user_email,
        })
        
        return domain

    async def delete_domain(
        self,
        db: AsyncSession,
        domain_id: int,
        user_email: str,
    ) -> bool:
        """Delete domain."""
        domain = await self.get_domain(db, domain_id)
        if not domain:
            return False
        
        # Check if domain is assigned
        if domain.status == DomainStatus.ASSIGNED.value:
            logger.warning(
                "Cannot delete assigned domain",
                domain_id=domain_id,
                name=domain.name
            )
            return False
        
        domain_name = domain.name
        await db.delete(domain)
        await db.flush()
        
        logger.info(
            "Domain deleted",
            domain_id=domain_id,
            name=domain_name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("domains", {
            "action": "deleted",
            "domain_id": domain_id,
            "domain_name": domain_name,
            "user": user_email,
        })
        
        return True

    async def lock_domain(
        self,
        db: AsyncSession,
        domain_id: int,
        user_email: str,
    ) -> bool:
        """Lock domain for editing."""
        lock_key = f"domain:{domain_id}"
        if not await redis_service.acquire_lock(lock_key, user_email):
            return False
        
        domain = await self.get_domain(db, domain_id)
        if domain:
            domain.locked_by = user_email
            domain.locked_at = datetime.utcnow()
            await db.flush()
            
            # Publish event
            await redis_service.publish("domains", {
                "action": "locked",
                "domain_id": domain_id,
                "user": user_email,
            })
        
        return True

    async def unlock_domain(
        self,
        db: AsyncSession,
        domain_id: int,
        user_email: str,
    ) -> bool:
        """Unlock domain."""
        lock_key = f"domain:{domain_id}"
        if not await redis_service.release_lock(lock_key, user_email):
            return False
        
        domain = await self.get_domain(db, domain_id)
        if domain and domain.locked_by == user_email:
            domain.locked_by = None
            domain.locked_at = None
            await db.flush()
            
            # Publish event
            await redis_service.publish("domains", {
                "action": "unlocked",
                "domain_id": domain_id,
                "user": user_email,
            })
        
        return True

    async def get_free_domains(
        self,
        db: AsyncSession,
        limit: int | None = None,
    ) -> list[Domain]:
        """Get free (unassigned) domains."""
        query = select(Domain).where(Domain.status == DomainStatus.FREE.value)
        
        if limit:
            query = query.limit(limit)
        
        result = await db.execute(query)
        return list(result.scalars().all())


domain_service = DomainService()
