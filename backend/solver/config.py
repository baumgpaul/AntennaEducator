"""Configuration for the Solver service."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Solver service configuration."""
    
    # Service identification
    service_name: str = "solver"
    version: str = "1.0.0"
    debug: bool = False
    
    # API configuration
    api_prefix: str = "/api/v1"
    
    # CORS settings
    cors_origins: List[str] = ["*"]
    cors_credentials: bool = True
    cors_methods: List[str] = ["*"]
    cors_headers: List[str] = ["*"]
    
    # Solver configuration defaults
    default_gauss_order: int = 6
    default_include_skin_effect: bool = True
    default_resistivity: float = 1.68e-8  # Copper [Ω·m]
    default_permeability: float = 1.0     # Relative permeability
    
    # Performance limits
    max_frequency_points: int = 1000
    max_edges: int = 10000
    max_branches: int = 20000
    timeout_seconds: int = 300
    
    class Config:
        env_prefix = "SOLVER_"
        case_sensitive = False


# Global settings instance
settings = Settings()
