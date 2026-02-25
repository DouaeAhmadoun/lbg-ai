"""
Database models using SQLAlchemy
Handles job history, admin settings, and API key storage
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config.settings import settings
import bcrypt

Base = declarative_base()

class Job(Base):
    """Job history tracking"""
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(50))  # 'ppt_translation' or 'excel_shipment'
    status = Column(String(20))  # 'processing', 'completed', 'failed'
    
    # File information
    input_filename = Column(String(255))
    output_filename = Column(String(255), nullable=True)
    output_path = Column(String(500), nullable=True)
    
    # Processing details
    provider = Column(String(50), nullable=True)  # 'claude', 'openrouter', 'offline'
    source_lang = Column(String(10), nullable=True)
    target_lang = Column(String(10), nullable=True)
    slides_processed = Column(Integer, default=0)
    total_slides = Column(Integer, default=0)
    
    # Metadata
    settings_used = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    processing_time_seconds = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Cost tracking (for paid APIs)
    estimated_cost = Column(Float, default=0.0)
    
    def to_dict(self):
        return {
            "id": self.id,
            "job_type": self.job_type,
            "status": self.status,
            "input_filename": self.input_filename,
            "output_filename": self.output_filename,
            "provider": self.provider,
            "source_lang": self.source_lang,
            "target_lang": self.target_lang,
            "slides_processed": self.slides_processed,
            "total_slides": self.total_slides,
            "settings_used": self.settings_used,
            "error_message": self.error_message,
            "processing_time_seconds": self.processing_time_seconds,
            "estimated_cost": self.estimated_cost,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class AdminSettings(Base):
    """Admin configuration storage"""
    __tablename__ = "admin_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True)
    value = Column(Text)
    encrypted = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password for storing"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Verify a password against a hash"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


class APIKey(Base):
    """API Keys storage"""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), unique=True)  # 'claude', 'openrouter'
    api_key = Column(Text)
    model_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Database engine and session
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create default admin password
    async with AsyncSessionLocal() as session:
        # Check if admin password exists
        from sqlalchemy import select
        result = await session.execute(
            select(AdminSettings).where(AdminSettings.key == "admin_password")
        )
        admin_pw = result.scalar_one_or_none()
        
        if not admin_pw:
            # Create default admin password
            hashed_pw = AdminSettings.hash_password(settings.default_admin_password)
            admin_pw = AdminSettings(
                key="admin_password",
                value=hashed_pw,
                encrypted=True
            )
            session.add(admin_pw)
            await session.commit()


async def get_db():
    """Dependency for getting database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
