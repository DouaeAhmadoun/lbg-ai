"""
Admin API Router
Handles authentication, API key management, and system settings
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from models.database import AdminSettings, APIKey, Job, get_db
from utils.helpers import (
    verify_admin_password,
    create_session,
    get_admin_session,
    save_api_key,
    get_api_key,
    cleanup_old_files,
    format_file_size
)
from config.settings import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Pydantic models
class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class APIKeyRequest(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None


class SettingsResponse(BaseModel):
    claude_model: str
    openrouter_model: str
    default_source_lang: str
    default_target_lang: str
    file_retention_days: int


# Authentication endpoints
@router.post("/login")
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Admin login"""
    is_valid = await verify_admin_password(request.password, db)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    token = await create_session(db)
    
    return {
        "success": True,
        "token": token,
        "message": "Login successful"
    }


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Change admin password"""
    # Verify current password
    is_valid = await verify_admin_password(request.current_password, db)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Update password
    result = await db.execute(
        select(AdminSettings).where(AdminSettings.key == "admin_password")
    )
    admin_pw = result.scalar_one_or_none()
    
    if admin_pw:
        admin_pw.value = AdminSettings.hash_password(request.new_password)
        admin_pw.updated_at = datetime.utcnow()
        await db.commit()
    
    return {
        "success": True,
        "message": "Password changed successfully"
    }


# API Key management
@router.get("/api-keys")
async def get_api_keys(
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Get all API keys (masked)"""
    result = await db.execute(select(APIKey))
    api_keys = result.scalars().all()
    
    masked_keys = []
    for key_obj in api_keys:
        masked_keys.append({
            "provider": key_obj.provider,
            "api_key": key_obj.api_key[:8] + "..." + key_obj.api_key[-4:] if len(key_obj.api_key) > 12 else "***",
            "model_name": key_obj.model_name,
            "is_active": key_obj.is_active,
            "updated_at": key_obj.updated_at.isoformat()
        })
    
    return {
        "api_keys": masked_keys
    }


@router.post("/api-keys")
async def update_api_key(
    request: APIKeyRequest,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Update or create API key"""
    await save_api_key(request.provider, request.api_key, request.model_name, db)
    
    return {
        "success": True,
        "message": f"API key for {request.provider} updated successfully"
    }


@router.delete("/api-keys/{provider}")
async def delete_api_key(
    provider: str,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Delete API key"""
    await db.execute(
        delete(APIKey).where(APIKey.provider == provider)
    )
    await db.commit()
    
    return {
        "success": True,
        "message": f"API key for {provider} deleted"
    }


# System settings
@router.get("/settings")
async def get_settings(
    session_token: str = Depends(get_admin_session)
):
    """Get system settings"""
    return {
        "claude_model": settings.default_claude_model,
        "openrouter_model": settings.default_openrouter_model,
        "default_source_lang": settings.default_source_lang,
        "default_target_lang": settings.default_target_lang,
        "file_retention_days": settings.file_retention_days,
        "max_upload_size": format_file_size(settings.max_upload_size)
    }


@router.post("/cleanup")
async def cleanup_files(
    session_token: str = Depends(get_admin_session)
):
    """Manually cleanup old files"""
    deleted_count = cleanup_old_files()
    
    return {
        "success": True,
        "message": f"Deleted {deleted_count} old files"
    }


# Job history
@router.get("/jobs")
async def get_job_history(
    limit: int = 50,
    offset: int = 0,
    job_type: Optional[str] = None,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Get job history"""
    query = select(Job).order_by(Job.created_at.desc())
    
    if job_type:
        query = query.where(Job.job_type == job_type)
    
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    return {
        "jobs": [job.to_dict() for job in jobs],
        "total": len(jobs)
    }


@router.get("/stats")
async def get_stats(
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Get system statistics"""
    # Count jobs
    result = await db.execute(select(Job))
    all_jobs = result.scalars().all()
    
    total_jobs = len(all_jobs)
    ppt_jobs = len([j for j in all_jobs if j.job_type == "ppt_translation"])
    excel_jobs = len([j for j in all_jobs if j.job_type == "excel_shipment"])
    completed_jobs = len([j for j in all_jobs if j.status == "completed"])
    failed_jobs = len([j for j in all_jobs if j.status == "failed"])
    
    total_cost = sum(j.estimated_cost for j in all_jobs if j.estimated_cost)
    
    # File storage info
    upload_size = sum(f.stat().st_size for f in settings.upload_dir.glob("*") if f.is_file())
    output_size = sum(f.stat().st_size for f in settings.output_dir.glob("*") if f.is_file())
    
    return {
        "total_jobs": total_jobs,
        "ppt_jobs": ppt_jobs,
        "excel_jobs": excel_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "total_cost": round(total_cost, 2),
        "storage": {
            "uploads": format_file_size(upload_size),
            "outputs": format_file_size(output_size),
            "total": format_file_size(upload_size + output_size)
        }
    }


# Excel Templates Management
@router.get("/excel/templates")
async def list_excel_templates(
    session_token: str = Depends(get_admin_session)
):
    """List all Excel templates with versions"""
    from pathlib import Path
    import re
    
    templates_dir = Path("templates")
    
    if not templates_dir.exists():
        return {
            "templates": [],
            "message": "Templates directory not found"
        }
    
    # Pattern: Shipment_{MARKET}_{YYYYMMDD_HHMMSS}.xlsx
    pattern = re.compile(r'^Shipment_([A-Z]{2})_(\d{8}_\d{6})\.xlsx$')
    
    # Group by market
    templates_by_market = {}
    
    for file_path in templates_dir.glob("Shipment_*.xlsx"):
        match = pattern.match(file_path.name)
        if match:
            market = match.group(1)
            timestamp = match.group(2)
            
            if market not in templates_by_market:
                templates_by_market[market] = []
            
            # Get file size
            file_size = file_path.stat().st_size
            
            templates_by_market[market].append({
                "filename": file_path.name,
                "timestamp": timestamp,
                "size": format_file_size(file_size),
                "path": str(file_path)
            })
    
    # Sort each market's templates by timestamp (newest first)
    for market in templates_by_market:
        templates_by_market[market].sort(key=lambda x: x['timestamp'], reverse=True)
    
    return {
        "templates": templates_by_market,
        "markets": list(templates_by_market.keys())
    }


@router.delete("/excel/templates/{market}/{timestamp}")
async def delete_excel_template(
    market: str,
    timestamp: str,
    session_token: str = Depends(get_admin_session)
):
    """Delete a specific template version"""
    from pathlib import Path
    
    templates_dir = Path("templates")
    filename = f"Shipment_{market}_{timestamp}.xlsx"
    file_path = templates_dir / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Don't allow deleting the last template for a market
    remaining = list(templates_dir.glob(f"Shipment_{market}_*.xlsx"))
    if len(remaining) <= 1:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete the last template for market {market}"
        )
    
    file_path.unlink()
    
    return {
        "success": True,
        "message": f"Template {filename} deleted successfully"
    }


@router.post("/excel/templates/{market}/set-active")
async def set_active_template(
    market: str,
    timestamp: str,
    session_token: str = Depends(get_admin_session)
):
    """Set a specific template as active (rename to latest timestamp)"""
    from pathlib import Path
    from datetime import datetime
    import shutil
    
    templates_dir = Path("templates")
    old_filename = f"Shipment_{market}_{timestamp}.xlsx"
    old_path = templates_dir / old_filename
    
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Create new filename with current timestamp
    new_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    new_filename = f"Shipment_{market}_{new_timestamp}.xlsx"
    new_path = templates_dir / new_filename
    
    # Copy file with new timestamp (keeps the old one as backup)
    shutil.copy2(old_path, new_path)
    
    return {
        "success": True,
        "message": f"Template set as active",
        "new_filename": new_filename
    }