"""Configuration for the FEM Solver service."""

from typing import List

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """FEM solver service configuration."""

    model_config = ConfigDict(env_prefix="SOLVER_FEM_", case_sensitive=False)

    service_name: str = "solver-fem"
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

    max_frequency_points: int = 500
    timeout_seconds: int = 600


settings = Settings()
