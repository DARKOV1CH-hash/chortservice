from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "ChortDomains"
    debug: bool = False
    dev_mode: bool = False
    dev_user_role: Literal["admin", "user"] = "admin"

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "chortdomains"
    postgres_password: str = "chortdomains"
    postgres_db: str = "chortdomains"

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    # Authentik OAuth2
    authentik_issuer: str = ""
    authentik_client_id: str = ""
    authentik_client_secret: str = ""
    authentik_access_group: str = "chortdomains - access"
    authentik_admin_group: str = "chortdomains - admin"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Server capacity modes
    default_capacity_mode: Literal["1:5", "1:7", "1:10"] = "1:5"

    # WebSocket
    ws_heartbeat_interval: int = 30  # seconds

    # Soft locks timeout
    lock_timeout: int = 300  # 5 minutes


@lru_cache
def get_settings() -> Settings:
    return Settings()