"""Configuration for the Postprocessor service."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Postprocessor service configuration."""
    
    # Service identification
    service_name: str = "postprocessor"
    version: str = "0.1.0"
    debug: bool = False
    
    # API configuration
    api_prefix: str = "/api/v1"
    
    # CORS settings
    cors_origins: List[str] = ["*"]
    cors_credentials: bool = True
    cors_methods: List[str] = ["*"]
    cors_headers: List[str] = ["*"]
    
    # Field computation settings
    default_theta_points: int = 181  # 0 to 180 degrees, 1° resolution
    default_phi_points: int = 360    # 0 to 360 degrees, 1° resolution
    far_field_distance_factor: float = 10.0  # r > 10λ for far-field
    
    # Radiation pattern settings
    beamwidth_threshold_db: float = -3.0  # 3dB beamwidth
    sidelobe_threshold_db: float = -10.0  # Sidelobe level
    
    # Export settings
    max_export_points: int = 1000000  # Limit data export size
    
    class Config:
        env_prefix = "POSTPROCESSOR_"
        case_sensitive = False


# Global settings instance
settings = Settings()
