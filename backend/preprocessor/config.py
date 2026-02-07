"""Configuration settings for the Preprocessor service."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings for the Preprocessor service."""

    model_config = ConfigDict(env_prefix="PREPROCESSOR_", case_sensitive=False)

    # Service configuration
    service_name: str = "preprocessor"
    version: str = "0.1.0"
    debug: bool = False

    # API configuration
    api_prefix: str = "/api"
    host: str = "0.0.0.0"
    port: int = 8001

    # CORS settings
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
    ]
    cors_credentials: bool = False
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]


settings = Settings()
