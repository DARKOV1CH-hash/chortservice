from datetime import datetime

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.assignment import Assignment
from src.models.domain import Domain, DomainStatus
from src.models.server import CapacityMode, Server, ServerStatus
from src.redis.client import redis_service
from src.schemas.assignment import AssignmentStatsResponse

logger = structlog.get_logger(__name__)


class AssignmentService:
    """Service for managing domain-server assignments."""

    async def create_assignment(
        self,
        db: AsyncSession,
        domain_id: int,
        server_id: int,
        user_email: str,
    ) -> Assignment | None:
        """
        Create assignment between domain and server.
        
        Returns None if server is full or domain already assigned.
        """
        # Get domain and server
        domain = await db.get(Domain, domain_id)
        server = await db.get(Server, server_id)
        
        if not domain or not server:
            logger.warning("Domain or server not found", domain_id=domain_id, server_id=server_id)
            return None
        
        # Check if domain already assigned
        if domain.status == DomainStatus.ASSIGNED.value:
            logger.warning("Domain already assigned", domain_id=domain_id)
            return None
        
        # Check server capacity
        if server.is_full:
            logger.warning("Server is full", server_id=server_id, current=server.current_domains, max=server.max_domains)
            return None
        
        # Create assignment
        assignment = Assignment(
            domain_id=domain_id,
            server_id=server_id,
            assigned_by=user_email,
        )
        db.add(assignment)
        
        # Update domain status
        domain.status = DomainStatus.ASSIGNED.value
        domain.updated_at = datetime.utcnow()
        
        # Update server counters
        server.current_domains += 1
        if server.current_domains >= server.max_domains:
            server.status = ServerStatus.IN_USE.value
        else:
            server.status = ServerStatus.IN_USE.value
        server.updated_at = datetime.utcnow()
        
        await db.flush()
        
        logger.info(
            "Assignment created",
            assignment_id=assignment.id,
            domain=domain.name,
            server=server.name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("assignments", {
            "action": "created",
            "assignment_id": assignment.id,
            "domain_id": domain_id,
            "domain_name": domain.name,
            "server_id": server_id,
            "server_name": server.name,
            "user": user_email,
        })
        
        return assignment

    async def bulk_assign(
        self,
        db: AsyncSession,
        domain_ids: list[int],
        server_id: int,
        user_email: str,
    ) -> tuple[list[Assignment], list[int]]:
        """
        Bulk assign domains to a server.
        
        Returns:
            Tuple of (created_assignments, failed_domain_ids)
        """
        server = await db.get(Server, server_id)
        if not server:
            return [], domain_ids
        
        assignments = []
        failed_ids = []
        
        for domain_id in domain_ids:
            if server.is_full:
                failed_ids.extend(domain_ids[len(assignments):])
                break
            
            assignment = await self.create_assignment(db, domain_id, server_id, user_email)
            if assignment:
                assignments.append(assignment)
            else:
                failed_ids.append(domain_id)
        
        await db.flush()
        
        logger.info(
            "Bulk assignment completed",
            server_id=server_id,
            success=len(assignments),
            failed=len(failed_ids),
            user=user_email
        )
        
        return assignments, failed_ids

    async def auto_assign(
        self,
        db: AsyncSession,
        domain_ids: list[int],
        user_email: str,
        capacity_mode: CapacityMode | None = None,
        distribute_evenly: bool = True,
    ) -> tuple[list[Assignment], list[int]]:
        """
        Automatically assign domains to servers.
        
        Distributes evenly across available servers based on capacity.
        
        Returns:
            Tuple of (created_assignments, failed_domain_ids)
        """
        # Get available servers
        query = select(Server).where(
            Server.current_domains < Server.max_domains
        )
        
        if capacity_mode:
            query = query.where(Server.capacity_mode == capacity_mode.value)
        
        if distribute_evenly:
            query = query.order_by(Server.current_domains.asc())
        
        result = await db.execute(query)
        servers = list(result.scalars().all())
        
        if not servers:
            logger.warning("No available servers for auto-assignment")
            return [], domain_ids
        
        assignments = []
        failed_ids = []
        server_idx = 0
        
        for domain_id in domain_ids:
            # Find next available server
            assigned = False
            for _ in range(len(servers)):
                server = servers[server_idx]
                
                if not server.is_full:
                    assignment = await self.create_assignment(
                        db, domain_id, server.id, user_email
                    )
                    if assignment:
                        assignments.append(assignment)
                        assigned = True
                        
                        # Move to next server for even distribution
                        if distribute_evenly:
                            server_idx = (server_idx + 1) % len(servers)
                        break
                
                server_idx = (server_idx + 1) % len(servers)
            
            if not assigned:
                failed_ids.append(domain_id)
        
        await db.flush()
        
        logger.info(
            "Auto-assignment completed",
            success=len(assignments),
            failed=len(failed_ids),
            servers_used=len(set(a.server_id for a in assignments)),
            user=user_email
        )
        
        return assignments, failed_ids

    async def delete_assignment(
        self,
        db: AsyncSession,
        assignment_id: int,
        user_email: str,
    ) -> bool:
        """Delete assignment and free up resources."""
        result = await db.execute(
            select(Assignment)
            .where(Assignment.id == assignment_id)
            .options(selectinload(Assignment.domain), selectinload(Assignment.server))
        )
        assignment = result.scalar_one_or_none()
        
        if not assignment:
            return False
        
        domain = assignment.domain
        server = assignment.server
        
        # Update domain status
        domain.status = DomainStatus.FREE.value
        domain.updated_at = datetime.utcnow()
        
        # Update server counters
        server.current_domains = max(0, server.current_domains - 1)
        if server.current_domains < server.max_domains:
            server.status = ServerStatus.FREE.value
        server.updated_at = datetime.utcnow()
        
        # Delete assignment
        await db.delete(assignment)
        await db.flush()
        
        logger.info(
            "Assignment deleted",
            assignment_id=assignment_id,
            domain=domain.name,
            server=server.name,
            user=user_email
        )
        
        # Publish event
        await redis_service.publish("assignments", {
            "action": "deleted",
            "assignment_id": assignment_id,
            "domain_id": domain.id,
            "domain_name": domain.name,
            "server_id": server.id,
            "server_name": server.name,
            "user": user_email,
        })
        
        return True

    async def delete_assignments_by_domain(
        self,
        db: AsyncSession,
        domain_id: int,
        user_email: str,
    ) -> bool:
        """Delete all assignments for a domain."""
        result = await db.execute(
            select(Assignment)
            .where(Assignment.domain_id == domain_id)
        )
        assignments = result.scalars().all()
        
        for assignment in assignments:
            await self.delete_assignment(db, assignment.id, user_email)
        
        return len(assignments) > 0

    async def delete_assignments_by_server(
        self,
        db: AsyncSession,
        server_id: int,
        user_email: str,
    ) -> int:
        """
        Delete all assignments for a server.
        
        Returns count of deleted assignments.
        """
        result = await db.execute(
            select(Assignment)
            .where(Assignment.server_id == server_id)
        )
        assignments = result.scalars().all()
        
        for assignment in assignments:
            await self.delete_assignment(db, assignment.id, user_email)
        
        return len(assignments)

    async def get_statistics(self, db: AsyncSession) -> AssignmentStatsResponse:
        """Get assignment statistics."""
        # Count servers
        total_servers = await db.scalar(select(func.count(Server.id)))
        servers_in_use = await db.scalar(
            select(func.count(Server.id)).where(Server.status == ServerStatus.IN_USE.value)
        )
        
        # Count domains
        total_domains = await db.scalar(select(func.count(Domain.id)))
        assigned_domains = await db.scalar(
            select(func.count(Domain.id)).where(Domain.status == DomainStatus.ASSIGNED.value)
        )
        
        # Calculate averages
        avg_load_result = await db.scalar(
            select(func.avg(Server.current_domains * 100.0 / Server.max_domains))
            .where(Server.max_domains > 0)
        )
        avg_load = float(avg_load_result or 0)
        
        # Capacity utilization by mode
        capacity_stats = {}
        for mode in CapacityMode:
            result = await db.execute(
                select(
                    func.count(Server.id).label("total"),
                    func.sum(Server.current_domains).label("used"),
                    func.sum(Server.max_domains).label("capacity"),
                ).where(Server.capacity_mode == mode.value)
            )
            row = result.one()
            capacity_stats[mode.value] = {
                "total_servers": row.total or 0,
                "used_slots": row.used or 0,
                "total_capacity": row.capacity or 0,
            }
        
        return AssignmentStatsResponse(
            total_servers=total_servers or 0,
            total_domains=total_domains or 0,
            assigned_domains=assigned_domains or 0,
            free_domains=(total_domains or 0) - (assigned_domains or 0),
            servers_in_use=servers_in_use or 0,
            servers_free=(total_servers or 0) - (servers_in_use or 0),
            average_load=round(avg_load, 2),
            capacity_utilization=capacity_stats,
        )


assignment_service = AssignmentService()