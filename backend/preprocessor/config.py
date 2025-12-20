"""Configuration settings for the Preprocessor service."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings for the Preprocessor service."""
    
    # Service configuration
    service_name: str = "preprocessor"
    version: str = "0.1.0"
    debug: bool = False
    
    # API configuration
    api_prefix: str = "/api/v1"
    host: str = "0.0.0.0"
    port: int = 8001
    
    # CORS settings
    cors_origins: list[str] = ["*"]
    cors_credentials: bool = True
    cors_methods: list[str] = ["*"]
    cors_headers: list[str] = ["*"]
    
    # Storage settings (for future use)
    storage_type: str = "local"  # "local", "s3", "minio"
    storage_bucket: Optional[str] = None
    storage_endpoint: Optional[str] = None
    
    # Database settings (for future use)
    database_url: Optional[str] = None
    
    class Config:
        env_prefix = "PREPROCESSOR_"
        case_sensitive = False


settings = Settings()
