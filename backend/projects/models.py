"""SQLAlchemy database models."""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    """User account model."""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    """Project model containing antenna designs."""
    
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="projects")
    elements = relationship("ProjectElement", back_populates="project", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="project", cascade="all, delete-orphan")


class ProjectElement(Base):
    """Antenna elements within a project (dipoles, loops, sources, etc.)."""
    
    __tablename__ = "project_elements"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    element_name = Column(String(50), nullable=False) 
    config_json = Column(Text, nullable=False)  # JSON string of element configuration
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="elements")


class Result(Base):
    """Simulation results for a project (field solution only)."""
    
    __tablename__ = "results"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    frequency = Column(Float, nullable=False)  # Frequency in Hz
    currents_s3_key = Column(String(500), nullable=True)  # MinIO/S3 key for current distribution data
    mesh_s3_key = Column(String(500), nullable=True)  # MinIO/S3 key for mesh data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="results")
