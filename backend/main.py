"""
Main FastAPI Application
Combines PPT translation, Excel shipment, and admin functionality
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import asyncio
from datetime import datetime, timedelta

from config.settings import settings
from models.database import init_db, get_db, AdminSettings
from routers import ppt_translation
from routers import excel_shipment
from routers import admin
from utils.helpers import cleanup_old_files
from sqlalchemy import select


async def _auto_cleanup_loop():
    """Run daily cleanup if auto_cleanup is enabled in DB settings."""
    while True:
        await asyncio.sleep(86400)  # check every 24 hours
        try:
            async for db in get_db():
                result = await db.execute(
                    select(AdminSettings).where(AdminSettings.key == "auto_cleanup_enabled")
                )
                setting = result.scalar_one_or_none()
                if setting and setting.value == "true":
                    deleted = cleanup_old_files()
                    print(f"🧹 Auto-cleanup: deleted {deleted} old files")
                    # Record last cleanup time
                    result2 = await db.execute(
                        select(AdminSettings).where(AdminSettings.key == "last_cleanup_at")
                    )
                    ts_row = result2.scalar_one_or_none()
                    now_str = datetime.utcnow().isoformat()
                    if ts_row:
                        ts_row.value = now_str
                    else:
                        db.add(AdminSettings(key="last_cleanup_at", value=now_str))
                    await db.commit()
        except Exception as e:
            print(f"⚠️ Auto-cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 Starting PPT & Excel Automation Server...")
    print(f"🔗 CORS Origins configured: {settings.CORS_ORIGINS}")
    await init_db()
    print("✅ Database initialized")

    cleanup_task = asyncio.create_task(_auto_cleanup_loop())

    yield

    cleanup_task.cancel()
    print("👋 Shutting down server...")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.debug else "An error occurred"
        }
    )


# Health check
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "database": "connected",
        "storage": {
            "uploads": settings.upload_dir.exists(),
            "outputs": settings.output_dir.exists()
        }
    }


# Include routers
app.include_router(admin.router)
app.include_router(ppt_translation.router)
app.include_router(excel_shipment.router)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )