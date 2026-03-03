"""
Admin API Router
Handles authentication, API key management, and system settings
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import shutil

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
from services.excel_service import _DEFAULT_TEMPLATES_DIR

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

class SaveSettingsRequest(BaseModel):
    ocr_model: Optional[str] = None


class TestModelRequest(BaseModel):
    model: str


@router.get("/settings")
async def get_settings(
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Get system settings"""
    result = await db.execute(
        select(AdminSettings).where(AdminSettings.key == "ocr_model")
    )
    ocr_setting = result.scalar_one_or_none()
    ocr_model = ocr_setting.value if ocr_setting else settings.default_ocr_model

    return {
        "claude_model": settings.default_claude_model,
        "openrouter_model": settings.default_openrouter_model,
        "default_source_lang": settings.default_source_lang,
        "default_target_lang": settings.default_target_lang,
        "file_retention_days": settings.file_retention_days,
        "max_upload_size": format_file_size(settings.max_upload_size),
        "ocr_model": ocr_model,
    }


@router.post("/settings")
async def save_settings(
    request: SaveSettingsRequest,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Save system settings"""
    if request.ocr_model is not None:
        result = await db.execute(
            select(AdminSettings).where(AdminSettings.key == "ocr_model")
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = request.ocr_model
            setting.updated_at = datetime.utcnow()
        else:
            db.add(AdminSettings(key="ocr_model", value=request.ocr_model))
        await db.commit()

    return {"success": True, "message": "Settings saved"}


@router.post("/test-model")
async def test_openrouter_model(
    request: TestModelRequest,
    session_token: str = Depends(get_admin_session),
    db: AsyncSession = Depends(get_db)
):
    """Test if an OpenRouter model is accessible"""
    import httpx

    model = request.model.strip()
    if not model:
        raise HTTPException(status_code=400, detail="Model name required")

    api_key = await get_api_key("openrouter", db)
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not configured")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Reply with one word: ok"}],
                    "max_tokens": 5,
                }
            )
        data = resp.json()
        if resp.status_code == 200:
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "ok")
            return {"valid": True, "message": f"Model works ✓ (replied: {reply.strip()[:30]!r})"}
        else:
            detail = data.get("error", {}).get("message", f"HTTP {resp.status_code}")
            return {"valid": False, "message": detail}
    except Exception as e:
        return {"valid": False, "message": str(e)}


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
    import re

    templates_dir = _DEFAULT_TEMPLATES_DIR

    if not templates_dir.exists():
        return {"templates": {}, "markets": []}

    pattern = re.compile(r'^Shipment_([A-Z]{2})_(\d{8}_\d{6})\.xlsx$')
    templates_by_market = {}

    for file_path in templates_dir.glob("Shipment_*.xlsx"):
        match = pattern.match(file_path.name)
        if match:
            market = match.group(1)
            timestamp = match.group(2)
            if market not in templates_by_market:
                templates_by_market[market] = []
            templates_by_market[market].append({
                "filename": file_path.name,
                "timestamp": timestamp,
                "size": format_file_size(file_path.stat().st_size),
            })

    for market in templates_by_market:
        templates_by_market[market].sort(key=lambda x: x['timestamp'], reverse=True)

    return {
        "templates": templates_by_market,
        "markets": sorted(templates_by_market.keys())
    }


@router.post("/excel/templates/upload")
async def upload_excel_template(
    market: str = Form(...),
    file: UploadFile = File(...),
    session_token: str = Depends(get_admin_session)
):
    """Upload a new Excel template for a market"""
    market = market.upper().strip()
    if len(market) != 2 or not market.isalpha():
        raise HTTPException(status_code=400, detail="Market must be a 2-letter country code (e.g. ES, FR, IT)")

    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="File must be an .xlsx file")

    templates_dir = _DEFAULT_TEMPLATES_DIR
    templates_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"Shipment_{market}_{timestamp}.xlsx"
    dest = templates_dir / filename

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "success": True,
        "filename": filename,
        "market": market,
        "message": f"Template uploaded for market {market}"
    }


@router.delete("/excel/templates/{market}/{timestamp}")
async def delete_excel_template(
    market: str,
    timestamp: str,
    session_token: str = Depends(get_admin_session)
):
    """Delete a specific template version"""
    templates_dir = _DEFAULT_TEMPLATES_DIR
    filename = f"Shipment_{market}_{timestamp}.xlsx"
    file_path = templates_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    remaining = list(templates_dir.glob(f"Shipment_{market}_*.xlsx"))
    if len(remaining) <= 1:
        raise HTTPException(status_code=400, detail=f"Cannot delete the last template for market {market}")

    file_path.unlink()
    return {"success": True, "message": f"Template {filename} deleted"}


@router.post("/excel/templates/{market}/set-active")
async def set_active_template(
    market: str,
    timestamp: str,
    session_token: str = Depends(get_admin_session)
):
    """Promote an older template to active by copying it with a newer timestamp"""
    templates_dir = _DEFAULT_TEMPLATES_DIR
    old_path = templates_dir / f"Shipment_{market}_{timestamp}.xlsx"

    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    new_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    new_filename = f"Shipment_{market}_{new_timestamp}.xlsx"
    shutil.copy2(old_path, templates_dir / new_filename)

    return {"success": True, "message": "Template set as active", "new_filename": new_filename}