"""
Utility functions for file handling, authentication, and helpers
"""

from fastapi import HTTPException, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.database import AdminSettings, APIKey, get_db
from config.settings import settings
from pathlib import Path
from datetime import datetime, timedelta
import secrets
import json
from typing import Optional

# Simple session token storage (in-memory, resets on server restart)
active_sessions = {}


def generate_session_token() -> str:
    """Generate a secure session token"""
    return secrets.token_urlsafe(32)


async def verify_admin_password(password: str, db: AsyncSession) -> bool:
    """Verify admin password against database"""
    result = await db.execute(
        select(AdminSettings).where(AdminSettings.key == "admin_password")
    )
    admin_pw = result.scalar_one_or_none()
    
    if not admin_pw:
        return False
    
    return AdminSettings.verify_password(password, admin_pw.value)


async def create_session(db: AsyncSession) -> str:
    """Create a new admin session"""
    token = generate_session_token()
    active_sessions[token] = {
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24)
    }
    return token


def verify_session(token: str) -> bool:
    """Verify if session token is valid"""
    if token not in active_sessions:
        return False
    
    session = active_sessions[token]
    if datetime.utcnow() > session["expires_at"]:
        del active_sessions[token]
        return False
    
    return True


async def get_admin_session(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Dependency to verify admin authentication"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    if not verify_session(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return token


async def get_api_key(provider: str, db: AsyncSession) -> Optional[str]:
    """Get API key for a provider from database"""
    result = await db.execute(
        select(APIKey).where(
            APIKey.provider == provider,
            APIKey.is_active == True
        )
    )
    api_key_obj = result.scalar_one_or_none()
    
    if api_key_obj:
        return api_key_obj.api_key
    
    # Fallback to environment variables
    if provider == "claude":
        return settings.claude_api_key
    elif provider == "openrouter":
        return settings.openrouter_api_key
    
    return None


async def save_api_key(
    provider: str,
    api_key: str,
    model_name: Optional[str],
    db: AsyncSession
):
    """Save or update API key in database"""
    result = await db.execute(
        select(APIKey).where(APIKey.provider == provider)
    )
    api_key_obj = result.scalar_one_or_none()
    
    if api_key_obj:
        api_key_obj.api_key = api_key
        api_key_obj.model_name = model_name
        api_key_obj.updated_at = datetime.utcnow()
    else:
        api_key_obj = APIKey(
            provider=provider,
            api_key=api_key,
            model_name=model_name
        )
        db.add(api_key_obj)
    
    await db.commit()


def cleanup_old_files():
    """Remove files older than retention period"""
    retention_date = datetime.utcnow() - timedelta(days=settings.file_retention_days)
    
    deleted_count = 0
    for directory in [settings.upload_dir, settings.output_dir]:
        for file_path in directory.glob("*"):
            if file_path.is_file():
                file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                if file_time < retention_date:
                    file_path.unlink()
                    deleted_count += 1
    
    return deleted_count


def save_job_file(file_content: bytes, filename: str, directory: str = "outputs") -> Path:
    """Save a file to the specified directory"""
    if directory == "outputs":
        base_dir = settings.output_dir
    else:
        base_dir = settings.upload_dir
    
    # Create unique filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name_parts = filename.rsplit(".", 1)
    if len(name_parts) == 2:
        unique_filename = f"{name_parts[0]}_{timestamp}.{name_parts[1]}"
    else:
        unique_filename = f"{filename}_{timestamp}"
    
    file_path = base_dir / unique_filename
    file_path.write_bytes(file_content)
    
    return file_path


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"
