"""Configuration settings for the FEM Solver service."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings for the FEM Solver service."""

    model_config = ConfigDict(env_prefix="FEM_SOLVER_", case_sensitive=False)

    service_name: str = "fem-solver"
    version: str = "0.1.0"
    debug: bool = False

    api_prefix: str = "/api"
    host: str = "0.0.0.0"
    port: int = 8005

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    cors_credentials: bool = False
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]

    max_dofs: int = 100_000
    timeout_seconds: int = 300


settings = Settings()
