import json
from typing import Any

import redis.asyncio as redis
import structlog

from src.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Global Redis client
_redis_client: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    """Get Redis client instance."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


class RedisService:
    """Redis service for pub/sub and locks."""

    def __init__(self):
        self.client: redis.Redis | None = None

    async def initialize(self):
        """Initialize Redis client."""
        self.client = await get_redis()
        logger.info("Redis client initialized")

    async def publish(self, channel: str, message: dict[str, Any]):
        """Publish message to channel."""
        if not self.client:
            await self.initialize()
        
        await self.client.publish(channel, json.dumps(message))
        logger.debug("Published message", channel=channel, message=message)

    async def acquire_lock(
        self, 
        key: str, 
        user_id: str, 
        timeout: int = 300
    ) -> bool:
        """
        Acquire soft lock for resource.
        
        Args:
            key: Lock key (e.g., "server:123", "domain:456")
            user_id: User acquiring the lock
            timeout: Lock timeout in seconds
        
        Returns:
            True if lock acquired, False if already locked
        """
        if not self.client:
            await self.initialize()
        
        lock_key = f"lock:{key}"
        result = await self.client.set(
            lock_key, 
            user_id, 
            nx=True,  # Only set if not exists
            ex=timeout
        )
        
        if result:
            logger.info("Lock acquired", key=key, user=user_id)
        else:
            current_owner = await self.client.get(lock_key)
            logger.warning(
                "Lock already held", 
                key=key, 
                user=user_id, 
                owner=current_owner
            )
        
        return bool(result)

    async def release_lock(self, key: str, user_id: str) -> bool:
        """
        Release lock if owned by user.
        
        Args:
            key: Lock key
            user_id: User releasing the lock
        
        Returns:
            True if lock released, False if not owned
        """
        if not self.client:
            await self.initialize()
        
        lock_key = f"lock:{key}"
        current_owner = await self.client.get(lock_key)
        
        if current_owner == user_id:
            await self.client.delete(lock_key)
            logger.info("Lock released", key=key, user=user_id)
            return True
        
        logger.warning(
            "Cannot release lock - not owner", 
            key=key, 
            user=user_id, 
            owner=current_owner
        )
        return False

    async def check_lock(self, key: str) -> str | None:
        """
        Check if resource is locked.
        
        Returns:
            User ID of lock owner, or None if not locked
        """
        if not self.client:
            await self.initialize()
        
        lock_key = f"lock:{key}"
        return await self.client.get(lock_key)

    async def extend_lock(self, key: str, user_id: str, timeout: int = 300) -> bool:
        """
        Extend lock timeout if owned by user.
        
        Args:
            key: Lock key
            user_id: User extending the lock
            timeout: New timeout in seconds
        
        Returns:
            True if extended, False if not owned
        """
        if not self.client:
            await self.initialize()
        
        lock_key = f"lock:{key}"
        current_owner = await self.client.get(lock_key)
        
        if current_owner == user_id:
            await self.client.expire(lock_key, timeout)
            logger.debug("Lock extended", key=key, user=user_id)
            return True
        
        return False


# Global service instance
redis_service = RedisService()