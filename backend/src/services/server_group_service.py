from datetime import datetime

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.server import Server
from src.models.server_group import ServerGroup
from src.redis.client import redis_service
from src.schemas.server_group import ServerGroupCreate, ServerGroupUpdate

logger = structlog.get_logger(__name__)


class ServerGroupService:
    """Service for managing server groups."""

    async def create_group(
        self,
        db: AsyncSession,
        group_data: ServerGroupCreate,
        user_email: str,
    ) -> ServerGroup:
        """Create new server group."""
        group = ServerGroup(
            name=group_data.name,
            description=group_data.description,
            color=group_data.color,
            created_by=user_email,
        )

        db.add(group)
        await db.flush()

        logger.info(
            "Server group created",
            group_id=group.id,
            name=group.name,
            user=user_email
        )

        # Publish event
        await redis_service.publish("server_groups", {
            "action": "created",
            "group_id": group.id,
            "group_name": group.name,
            "user": user_email,
        })

        return group

    async def get_group(
        self,
        db: AsyncSession,
        group_id: int,
    ) -> ServerGroup | None:
        """Get server group by ID with servers."""
        result = await db.execute(
            select(ServerGroup)
            .where(ServerGroup.id == group_id)
            .options(selectinload(ServerGroup.servers))
        )
        return result.scalar_one_or_none()

    async def get_groups(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[ServerGroup], int]:
        """Get list of server groups with pagination."""
        # Count total
        count_query = select(func.count(ServerGroup.id))
        total = await db.scalar(count_query)

        # Get paginated results with servers loaded
        query = (
            select(ServerGroup)
            .options(selectinload(ServerGroup.servers))
            .offset(skip)
            .limit(limit)
            .order_by(ServerGroup.name)
        )
        result = await db.execute(query)
        groups = result.scalars().all()

        return list(groups), total or 0

    async def update_group(
        self,
        db: AsyncSession,
        group_id: int,
        group_data: ServerGroupUpdate,
        user_email: str,
    ) -> ServerGroup | None:
        """Update server group."""
        group = await self.get_group(db, group_id)
        if not group:
            return None

        # Update fields
        update_data = group_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(group, field, value)

        group.updated_at = datetime.utcnow()
        await db.flush()

        logger.info(
            "Server group updated",
            group_id=group.id,
            changes=list(update_data.keys()),
            user=user_email
        )

        # Publish event
        await redis_service.publish("server_groups", {
            "action": "updated",
            "group_id": group.id,
            "group_name": group.name,
            "changes": list(update_data.keys()),
            "user": user_email,
        })

        return group

    async def delete_group(
        self,
        db: AsyncSession,
        group_id: int,
        user_email: str,
    ) -> bool:
        """Delete server group. Servers will have group_id set to NULL."""
        group = await self.get_group(db, group_id)
        if not group:
            return False

        group_name = group.name
        await db.delete(group)
        await db.flush()

        logger.info(
            "Server group deleted",
            group_id=group_id,
            name=group_name,
            user=user_email
        )

        # Publish event
        await redis_service.publish("server_groups", {
            "action": "deleted",
            "group_id": group_id,
            "group_name": group_name,
            "user": user_email,
        })

        return True

    async def assign_servers_to_group(
        self,
        db: AsyncSession,
        group_id: int,
        server_ids: list[int],
        user_email: str,
    ) -> tuple[int, list[int]]:
        """
        Assign servers to a group.

        Returns tuple of (assigned_count, failed_server_ids).
        """
        group = await self.get_group(db, group_id)
        if not group:
            return 0, server_ids

        assigned = 0
        failed = []

        for server_id in server_ids:
            server = await db.get(Server, server_id)
            if server:
                server.group_id = group_id
                server.updated_at = datetime.utcnow()
                assigned += 1
            else:
                failed.append(server_id)

        await db.flush()

        logger.info(
            "Servers assigned to group",
            group_id=group_id,
            assigned=assigned,
            failed=len(failed),
            user=user_email
        )

        # Publish event
        await redis_service.publish("server_groups", {
            "action": "servers_assigned",
            "group_id": group_id,
            "count": assigned,
            "user": user_email,
        })

        return assigned, failed

    async def remove_servers_from_group(
        self,
        db: AsyncSession,
        group_id: int,
        server_ids: list[int],
        user_email: str,
    ) -> int:
        """
        Remove servers from a group.

        Returns count of removed servers.
        """
        removed = 0

        for server_id in server_ids:
            server = await db.get(Server, server_id)
            if server and server.group_id == group_id:
                server.group_id = None
                server.updated_at = datetime.utcnow()
                removed += 1

        await db.flush()

        logger.info(
            "Servers removed from group",
            group_id=group_id,
            removed=removed,
            user=user_email
        )

        # Publish event
        await redis_service.publish("server_groups", {
            "action": "servers_removed",
            "group_id": group_id,
            "count": removed,
            "user": user_email,
        })

        return removed

    async def get_ungrouped_servers(
        self,
        db: AsyncSession,
    ) -> list[Server]:
        """Get servers not assigned to any group."""
        result = await db.execute(
            select(Server).where(Server.group_id.is_(None))
        )
        return list(result.scalars().all())


server_group_service = ServerGroupService()
