"""Configuration for the FDTD Solver service."""

from typing import List

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """FDTD solver service configuration."""

    model_config = ConfigDict(env_prefix="SOLVER_FDTD_", case_sensitive=False)

    service_name: str = "solver-fdtd"
    version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = "/api"

    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    cors_credentials: bool = False
    cors_methods: List[str] = ["*"]
    cors_headers: List[str] = ["*"]

    max_time_steps: int = 100_000
    timeout_seconds: int = 600


settings = Settings()
