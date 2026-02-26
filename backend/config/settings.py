"""
Configuration settings for the application
Manages API keys, admin credentials, and application settings
"""

from pydantic_settings import BaseSettings
from pydantic import Field
import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application
    app_name: str = "PPT & Excel Automation"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS
    cors_origins: str = "http://localhost:3000"
    
    # Database URL from environment
    _database_url: str = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR}/app.db")
    
    @property
    def database_url(self) -> str:
        """Convert postgresql:// to postgresql+asyncpg:// for async support"""
        url = self._database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url
    
    # File storage
    upload_dir: Path = Path(BASE_DIR / "uploads")
    output_dir: Path = Path("/data/outputs") # BASE_DIR / "outputs"
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    
    # File retention (days)
    file_retention_days: int = 30
    
    # Admin credentials (hashed password stored in DB, default: admin123)
    admin_username: str = "admin"
    default_admin_password: str = "admin123"
    
    # API Keys (stored in database, these are fallbacks)
    claude_api_key: str = Field(default="", env="CLAUDE_API_KEY")
    openrouter_api_key: str = Field(default="", env="OPENROUTER_API_KEY")
    
    # Default LLM settings
    default_claude_model: str = "claude-sonnet-4-20250514"
    default_openrouter_model: str = "google/gemma-3-12b-it:free"
    default_ocr_model: str = "openrouter/free"  # Auto-selects best available free model
    
    # Translation defaults
    default_source_lang: str = "es"
    default_target_lang: str = "en"
    default_preserve_colors: bool = True
    default_base_font_size: int = 11
    
    # Processing
    max_concurrent_jobs: int = 3
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Global settings instance
settings = Settings()

# Ensure directories exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)