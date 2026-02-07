"""Configuration for the Postprocessor service."""

from typing import List

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Postprocessor service configuration."""

    model_config = ConfigDict(env_prefix="POSTPROCESSOR_", case_sensitive=False)

    # Service identification
    service_name: str = "postprocessor"
    version: str = "0.1.0"
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

    # Field computation settings
    default_theta_points: int = 181
    default_phi_points: int = 360
    far_field_distance_factor: float = 10.0


# Global settings instance
settings = Settings()
