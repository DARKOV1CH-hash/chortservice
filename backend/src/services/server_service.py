from datetime import datetime

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.assignment import Assignment
from src.models.server import CapacityMode, Server, ServerStatus
from src.redis.client import redis_service
from src.schemas.server import ServerCreate, ServerUpdate

logger = structlog.get_logger(__name__)


class ServerService:
    """Service for managing servers."""

    @staticmethod
    def _get_max_domains(capacity_mode: CapacityMode) -> int:
        """Get max domains based on capacity mode."""
        capacity_map = {
            CapacityMode.MODE_1_5: 5,
            CapacityMode.MODE_1_7: 7,
            CapacityMode.MODE_1_10: 10,
        }
        return capacity_map.get(capacity_mode, 5)

    async def create_server(
        self, 
        db: AsyncSession, 
        server_data: ServerCreate, 
        user_email: str
    ) -> Server:
        """Create new server."""
        max_domains = self._get_max_domains(server_data.capacity_mode)
        
        server = Server(
            name=server_data.name,
            ip_address=server_data.ip_address,
            capacity_mode=server_data.capacity_mode.value,
            max_domains=max_domains,
            is_central_config=server_data.is_central_config,
            individual_config=server_data.individual_config,
            central_config=server_data.central_config,
            description=server_data.description,
            created_by=user_email,
        )
        
        db.add(server)
        await db.flush()
        
        logger.info(
            "Server created",
            server_id=server.id,
            name=server.name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("servers", {
            "action": "created",
            "server_id": server.id,
            "server_name": server.name,
            "user": user_email,
        })
        
        return server

    async def get_server(self, db: AsyncSession, server_id: int) -> Server | None:
        """Get server by ID."""
        result = await db.execute(
            select(Server)
            .where(Server.id == server_id)
            .options(
                selectinload(Server.assignments).selectinload(Assignment.domain)
            )
        )
        return result.scalar_one_or_none()

    async def get_servers(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        status: ServerStatus | None = None,
    ) -> tuple[list[Server], int]:
        """Get list of servers with pagination."""
        query = select(Server)
        
        if status:
            query = query.where(Server.status == status.value)
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = await db.scalar(count_query)
        
        # Get paginated results
        query = query.offset(skip).limit(limit).order_by(Server.created_at.desc())
        result = await db.execute(query)
        servers = result.scalars().all()
        
        return list(servers), total or 0

    async def update_server(
        self,
        db: AsyncSession,
        server_id: int,
        server_data: ServerUpdate,
        user_email: str,
    ) -> Server | None:
        """Update server."""
        server = await self.get_server(db, server_id)
        if not server:
            return None
        
        # Update fields
        update_data = server_data.model_dump(exclude_unset=True)
        
        # Handle capacity mode change
        if "capacity_mode" in update_data:
            new_mode = update_data["capacity_mode"]
            if isinstance(new_mode, str):
                new_mode = CapacityMode(new_mode)
            max_domains = self._get_max_domains(new_mode)
            update_data["max_domains"] = max_domains
            update_data["capacity_mode"] = new_mode.value
        
        for field, value in update_data.items():
            setattr(server, field, value)
        
        server.updated_at = datetime.utcnow()
        await db.flush()
        
        logger.info(
            "Server updated",
            server_id=server.id,
            changes=list(update_data.keys()),
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("servers", {
            "action": "updated",
            "server_id": server.id,
            "server_name": server.name,
            "changes": list(update_data.keys()),
            "user": user_email,
        })
        
        return server

    async def delete_server(
        self, 
        db: AsyncSession, 
        server_id: int,
        user_email: str
    ) -> bool:
        """Delete server."""
        server = await self.get_server(db, server_id)
        if not server:
            return False
        
        # Check if server has assignments
        if server.current_domains > 0:
            logger.warning(
                "Cannot delete server with assignments",
                server_id=server_id,
                domains=server.current_domains
            )
            return False
        
        server_name = server.name
        await db.delete(server)
        await db.flush()
        
        logger.info(
            "Server deleted",
            server_id=server_id,
            name=server_name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("servers", {
            "action": "deleted",
            "server_id": server_id,
            "server_name": server_name,
            "user": user_email,
        })
        
        return True

    async def lock_server(
        self,
        db: AsyncSession,
        server_id: int,
        user_email: str,
    ) -> bool:
        """Lock server for editing."""
        # Try to acquire Redis lock
        lock_key = f"server:{server_id}"
        if not await redis_service.acquire_lock(lock_key, user_email):
            return False
        
        # Update DB
        server = await self.get_server(db, server_id)
        if server:
            server.locked_by = user_email
            server.locked_at = datetime.utcnow()
            await db.flush()
            
            # Publish event
            await redis_service.publish("servers", {
                "action": "locked",
                "server_id": server_id,
                "user": user_email,
            })
        
        return True

    async def unlock_server(
        self,
        db: AsyncSession,
        server_id: int,
        user_email: str,
    ) -> bool:
        """Unlock server."""
        lock_key = f"server:{server_id}"
        if not await redis_service.release_lock(lock_key, user_email):
            return False
        
        # Update DB
        server = await self.get_server(db, server_id)
        if server and server.locked_by == user_email:
            server.locked_by = None
            server.locked_at = None
            await db.flush()
            
            # Publish event
            await redis_service.publish("servers", {
                "action": "unlocked",
                "server_id": server_id,
                "user": user_email,
            })
        
        return True

    async def get_available_servers(
        self,
        db: AsyncSession,
        capacity_mode: CapacityMode | None = None,
    ) -> list[Server]:
        """Get servers with available capacity."""
        query = select(Server).where(
            Server.current_domains < Server.max_domains
        )
        
        if capacity_mode:
            query = query.where(Server.capacity_mode == capacity_mode.value)
        
        query = query.order_by(Server.current_domains.asc())
        result = await db.execute(query)
        return list(result.scalars().all())


server_service = ServerService()
