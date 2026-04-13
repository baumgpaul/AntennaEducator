"""Configuration settings for the FEM Postprocessor service."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings for the FEM Postprocessor service."""

    model_config = ConfigDict(env_prefix="FEM_POSTPROCESSOR_", case_sensitive=False)

    service_name: str = "fem-postprocessor"
    version: str = "0.1.0"
    debug: bool = False

    api_prefix: str = "/api"
    host: str = "0.0.0.0"
    port: int = 8006

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    cors_credentials: bool = False
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]

    max_line_plot_points: int = 1000
    max_export_nodes: int = 500_000


settings = Settings()
