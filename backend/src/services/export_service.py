import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.assignment import Assignment
from src.models.server import Server
from src.models.server_group import ServerGroup

logger = structlog.get_logger(__name__)


class ExportService:
    """Service for exporting assignments to Domain Hub format."""

    async def export_to_domain_hub(
        self,
        db: AsyncSession,
        server_id: int | None = None,
    ) -> str:
        """
        Export assignments to Domain Hub format.
        
        Format:
        [server_ip]
        domain1.com
        domain2.com
        
        [server_ip_2]
        domain3.com
        
        Args:
            server_id: Optional server ID to export specific server
        
        Returns:
            Formatted text ready for Domain Hub
        """
        query = select(Server).options(
            selectinload(Server.assignments).selectinload(Assignment.domain)
        )
        
        if server_id:
            query = query.where(Server.id == server_id)
        
        query = query.order_by(Server.name)
        result = await db.execute(query)
        servers = result.scalars().all()
        
        output_lines = []
        
        for server in servers:
            if not server.assignments:
                continue

            # Server header with IP and password (if exists)
            if server.password:
                output_lines.append(f"{server.ip_address} {server.password}")
            else:
                output_lines.append(f"{server.ip_address}")

            # Add domains
            for assignment in sorted(server.assignments, key=lambda a: a.domain.name):
                output_lines.append(assignment.domain.name)

            # Empty line between servers
            output_lines.append("")
        
        export_text = "\n".join(output_lines)
        
        logger.info(
            "Exported to Domain Hub format",
            server_id=server_id,
            servers_count=len(servers),
            total_lines=len(output_lines)
        )
        
        return export_text

    async def export_server_config(
        self,
        db: AsyncSession,
        server_id: int,
    ) -> dict[str, any]:
        """
        Export server configuration with assigned domains.
        
        Returns dict with server info and domain list.
        """
        result = await db.execute(
            select(Server)
            .where(Server.id == server_id)
            .options(
                selectinload(Server.assignments).selectinload(Assignment.domain)
            )
        )
        server = result.scalar_one_or_none()
        
        if not server:
            logger.warning("Server not found for export", server_id=server_id)
            return {}
        
        domains = [assignment.domain.name for assignment in server.assignments]
        
        config = {
            "server": {
                "name": server.name,
                "ip_address": server.ip_address,
                "capacity_mode": server.capacity_mode,
                "max_domains": server.max_domains,
                "current_domains": server.current_domains,
            },
            "config": {
                "is_central": server.is_central_config,
                "individual_config": server.individual_config,
                "central_config": server.central_config,
            },
            "domains": sorted(domains),
            "stats": {
                "total_assigned": len(domains),
                "available_slots": server.available_slots,
                "utilization_percent": round(
                    (server.current_domains / server.max_domains * 100) if server.max_domains > 0 else 0,
                    2
                ),
            }
        }
        
        logger.info(
            "Exported server config",
            server_id=server_id,
            domains_count=len(domains)
        )
        
        return config

    async def export_all_assignments_csv(
        self,
        db: AsyncSession,
    ) -> str:
        """
        Export all assignments as CSV.
        
        Format: domain_name,server_name,server_ip,assigned_at,assigned_by
        """
        result = await db.execute(
            select(Assignment)
            .options(
                selectinload(Assignment.domain),
                selectinload(Assignment.server)
            )
            .order_by(Assignment.assigned_at.desc())
        )
        assignments = result.scalars().all()
        
        lines = ["domain_name,server_name,server_ip,assigned_at,assigned_by"]
        
        for assignment in assignments:
            lines.append(
                f"{assignment.domain.name},"
                f"{assignment.server.name},"
                f"{assignment.server.ip_address},"
                f"{assignment.assigned_at.isoformat()},"
                f"{assignment.assigned_by}"
            )
        
        csv_text = "\n".join(lines)
        
        logger.info(
            "Exported assignments to CSV",
            count=len(assignments)
        )
        
        return csv_text

    async def export_capacity_report(
        self,
        db: AsyncSession,
    ) -> dict[str, any]:
        """
        Generate capacity utilization report.
        
        Returns detailed statistics about server usage.
        """
        result = await db.execute(
            select(Server).options(
                selectinload(Server.assignments).selectinload(Assignment.domain)
            )
        )
        servers = result.scalars().all()
        
        report = {
            "summary": {
                "total_servers": len(servers),
                "total_capacity": sum(s.max_domains for s in servers),
                "used_capacity": sum(s.current_domains for s in servers),
                "free_capacity": sum(s.available_slots for s in servers),
            },
            "by_capacity_mode": {},
            "servers": []
        }
        
        # Group by capacity mode
        from collections import defaultdict
        by_mode = defaultdict(lambda: {"count": 0, "capacity": 0, "used": 0})
        
        for server in servers:
            mode = server.capacity_mode
            by_mode[mode]["count"] += 1
            by_mode[mode]["capacity"] += server.max_domains
            by_mode[mode]["used"] += server.current_domains
            
            report["servers"].append({
                "id": server.id,
                "name": server.name,
                "ip_address": server.ip_address,
                "capacity_mode": server.capacity_mode,
                "max_domains": server.max_domains,
                "current_domains": server.current_domains,
                "available_slots": server.available_slots,
                "utilization_percent": round(
                    (server.current_domains / server.max_domains * 100) if server.max_domains > 0 else 0,
                    2
                ),
            })
        
        report["by_capacity_mode"] = dict(by_mode)
        
        # Calculate overall utilization
        if report["summary"]["total_capacity"] > 0:
            report["summary"]["utilization_percent"] = round(
                (report["summary"]["used_capacity"] / report["summary"]["total_capacity"] * 100),
                2
            )
        else:
            report["summary"]["utilization_percent"] = 0

        report["summary"]["overall_utilization"] = report["summary"]["utilization_percent"]
        
        logger.info("Generated capacity report")

        return report

    async def export_group_to_domain_hub(
        self,
        db: AsyncSession,
        group_id: int,
    ) -> str:
        """
        Export all servers in a group to Domain Hub format.

        Format:
        IP password
        domain1.com
        domain2.com

        IP2 password2
        domain3.com

        Args:
            group_id: Server group ID

        Returns:
            Formatted text ready for Domain Hub
        """
        # Get group with servers and their assignments
        result = await db.execute(
            select(ServerGroup)
            .where(ServerGroup.id == group_id)
            .options(
                selectinload(ServerGroup.servers)
                .selectinload(Server.assignments)
                .selectinload(Assignment.domain)
            )
        )
        group = result.scalar_one_or_none()

        if not group:
            logger.warning("Server group not found for export", group_id=group_id)
            return ""

        output_lines = []

        # Sort servers by name
        for server in sorted(group.servers, key=lambda s: s.name):
            if not server.assignments:
                continue

            # Server header with IP and password (if exists)
            if server.password:
                output_lines.append(f"{server.ip_address} {server.password}")
            else:
                output_lines.append(f"{server.ip_address}")

            # Add domains
            for assignment in sorted(server.assignments, key=lambda a: a.domain.name):
                output_lines.append(assignment.domain.name)

            # Empty line between servers
            output_lines.append("")

        export_text = "\n".join(output_lines)

        logger.info(
            "Exported group to Domain Hub format",
            group_id=group_id,
            group_name=group.name,
            servers_count=len(group.servers),
            total_lines=len(output_lines)
        )

        return export_text


export_service = ExportService()
