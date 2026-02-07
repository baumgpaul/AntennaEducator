"""Configuration for the Solver service."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Solver service configuration."""

    model_config = ConfigDict(env_prefix="SOLVER_", case_sensitive=False)

    # Service identification
    service_name: str = "solver"
    version: str = "1.0.0"
    debug: bool = False

    # API configuration
    api_prefix: str = "/api"

    # CORS settings
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    cors_credentials: bool = False
    cors_methods: List[str] = ["*"]
    cors_headers: List[str] = ["*"]

    # Performance limits
    max_frequency_points: int = 1000
    max_edges: int = 10000
    max_branches: int = 20000
    timeout_seconds: int = 300


# Global settings instance
settings = Settings()
