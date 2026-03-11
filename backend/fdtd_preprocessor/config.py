"""Configuration for the FDTD Preprocessor service."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """FDTD preprocessor service configuration."""

    model_config = ConfigDict(env_prefix="FDTD_PREPROCESSOR_", case_sensitive=False)

    service_name: str = "fdtd-preprocessor"
    version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = "/api"
    host: str = "0.0.0.0"
    port: int = 8004

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    cors_credentials: bool = False
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]

    max_grid_cells: int = 10_000_000


settings = Settings()
