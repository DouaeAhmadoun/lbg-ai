"""
Excel Shipment API Router
Handles Excel file generation for shipments
"""

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from models.database import Job, get_db, AdminSettings
from services.excel_service import ShipmentProcessor, _DEFAULT_TEMPLATES_DIR
from utils.helpers import save_job_file
from config.settings import settings

router = APIRouter(prefix="/api/excel", tags=["excel"])

# In-memory storage for processors (simplified - use Redis in production)
processors = {}


@router.post("/upload-client-data")
async def upload_client_data(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload client data — auto-detects dominant market, returns all validation reports"""
    try:
        print(f"📥 Received file: {file.filename}, session: {session_id}")
        file_content = await file.read()

        # Read active template overrides from DB
        result = await db.execute(
            select(AdminSettings).where(AdminSettings.key.like("active_template_%"))
        )
        rows = result.scalars().all()
        active_overrides = {
            row.key.replace("active_template_", ""): row.value
            for row in rows if row.value
        }

        processor = ShipmentProcessor(active_overrides=active_overrides)
        available_markets = processor.get_available_markets()
        print(f"✅ Templates loaded: {available_markets}")

        df = processor.load_client_data(file_content)
        print(f"✅ Client data loaded: {len(df)} records, columns: {list(df.columns)}")

        processors[session_id] = processor

        from services.excel_service import detect_dominant_market, validate_shipment_data, get_column_mapping_info
        suggested_market, market_counts = detect_dominant_market(df)
        print(f"💡 Suggested market: {suggested_market}, counts: {market_counts}")

        # Pre-compute validation + column mapping for all available markets
        validation_reports = {}
        column_mapping = {}
        for market in available_markets:
            validation_reports[market] = validate_shipment_data(df, market)
            column_mapping[market] = get_column_mapping_info(df, market)
            print(f"📋 {market} validation: {validation_reports[market]['valid_rows']}/{validation_reports[market]['total_rows']} valid")

        # Data preview: first 5 rows as list of dicts (NaN → None for JSON)
        preview_df = df.head(5).where(pd.notna(df.head(5)), None)
        data_preview = {
            "columns": list(df.columns),
            "rows": preview_df.to_dict(orient="records")
        }

        return {
            "success": True,
            "total_records": len(df),
            "columns": list(df.columns),
            "available_markets": available_markets,
            "suggested_market": suggested_market,
            "market_counts": market_counts,
            "validation_reports": validation_reports,
            "column_mapping": column_mapping,
            "data_preview": data_preview
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in upload-client-data: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload-template/{market}")
async def upload_template(
    market: str,
    file: UploadFile = File(...),
    session_id: str = Form(None)  # Optional - only needed if updating active session
):
    """Upload/update market template (Admin use)"""
    try:
        # Validate market
        if market not in ['IT', 'FR', 'ES']:
            raise HTTPException(status_code=400, detail=f"Invalid market: {market}. Must be IT, FR, or ES.")
        
        file_content = await file.read()
        
        # If session exists, also load into current processor
        if session_id and session_id in processors:
            processor = processors[session_id]
            processor.load_template(file_content, market)
        
        # Save to templates directory with timestamp naming
        templates_dir = _DEFAULT_TEMPLATES_DIR
        templates_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename with timestamp: Shipment_XX_YYYYMMDD_HHMMSS.xlsx
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        template_filename = f"Shipment_{market}_{timestamp}.xlsx"
        template_path = templates_dir / template_filename
        
        with open(template_path, 'wb') as f:
            f.write(file_content)
        
        print(f"📁 Saved new template: {template_path}")
        
        return {
            "success": True,
            "market": market,
            "filename": template_filename,
            "message": f"Template for {market} uploaded and saved successfully"
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.get("/templates/list")
async def list_templates():
    """List all available templates by market with their timestamps"""
    try:
        templates_dir = _DEFAULT_TEMPLATES_DIR
        if not templates_dir.exists():
            return {
                "success": True,
                "templates": {},
                "message": "Templates directory not found"
            }
        
        templates_by_market = {}
        markets = ['IT', 'FR', 'ES']
        
        for market in markets:
            pattern = f"Shipment_{market}_*.xlsx"
            matching_files = sorted(
                templates_dir.glob(pattern),
                reverse=True  # Latest first
            )
            
            templates_by_market[market] = [
                {
                    "filename": f.name,
                    "timestamp": f.stem.split('_')[-2] + '_' + f.stem.split('_')[-1],  # Extract timestamp
                    "size_kb": round(f.stat().st_size / 1024, 2),
                    "is_latest": i == 0
                }
                for i, f in enumerate(matching_files)
            ]
        
        return {
            "success": True,
            "templates": templates_by_market
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available-markets")
async def get_available_markets(session_id: str = None):
    """Get list of available markets (countries with templates)"""
    try:
        # If session exists, get from processor
        if session_id and session_id in processors:
            processor = processors[session_id]
        else:
            # Create temporary processor just to check available templates
            processor = ShipmentProcessor()
        
        available = processor.get_available_markets()
        
        return {
            "success": True,
            "markets": available,
            "total": len(available)
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/generate")
async def generate_shipment_files(
    session_id: str = Form(...),
    market: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """Generate shipment file for the selected market using all client data"""
    try:
        print(f"🎯 Generate called - session: {session_id}, market: {market}")

        if session_id not in processors:
            raise HTTPException(status_code=400, detail="Session not found")

        if market not in ['IT', 'FR', 'ES']:
            raise HTTPException(status_code=400, detail=f"Invalid market: {market}")

        processor = processors[session_id]
        print(f"🗂️  Processor has templates for: {processor.get_available_markets()}")
        print(f"📊 Client data records: {len(processor.client_data) if processor.client_data is not None else 0}")

        job = Job(
            job_type="excel_shipment",
            status="processing",
            input_filename="client_data.xlsx",
            settings_used={"market": market}
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        file_bytes = processor.generate_shipment_file(market)

        from services.excel_service import MARKET_NAMES
        timestamp = datetime.now().strftime('%Y-%m-%d_%Hh%M')
        market_name = MARKET_NAMES.get(market, market)
        filename = f"Shipment_{market_name}_{timestamp}.xlsx"
        file_path = save_job_file(file_bytes, filename, "outputs")

        job.status = "completed"
        job.completed_at = datetime.now()
        job.output_path = str(file_path)
        job.output_filename = filename
        await db.commit()

        print(f"✅ Job {job.id} completed: {filename}")
        return {"job_id": job.id, "status": "completed"}

    except HTTPException:
        raise
    except Exception as e:
        if 'job' in locals():
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()
        print(f"❌ Generate error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{job_id}")
async def download_shipment(
    job_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Download generated shipment file(s)"""
    try:
        print(f"🔍 Excel Download request for job_id: {job_id}")
        
        from sqlalchemy import select
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            print(f"❌ Job {job_id} not found in database")
            raise HTTPException(status_code=404, detail="Job not found")
        
        print(f"✅ Job found: status={job.status}")
        print(f"📄 output_path from DB: {job.output_path}")
        print(f"📄 output_filename from DB: {job.output_filename}")
        
        if job.status != "completed":
            print(f"❌ Job not completed, status: {job.status}")
            raise HTTPException(status_code=400, detail="Job not completed")
        
        from pathlib import Path
        import os
        
        file_path = Path(job.output_path)
        print(f"🔍 Looking for file at: {file_path}")
        print(f"📁 File exists? {file_path.exists()}")
        print(f"📂 Settings output_dir: {settings.output_dir}")
        
        # List files in output directory
        try:
            if settings.output_dir.exists():
                files_in_dir = list(settings.output_dir.iterdir())
                print(f"📂 Files in {settings.output_dir}:")
                for f in files_in_dir:
                    print(f"   - {f.name}")
            else:
                print(f"❌ Output directory doesn't exist: {settings.output_dir}")
        except Exception as e:
            print(f"⚠️ Error listing directory: {e}")
        
        if not file_path.exists():
            print(f"❌ File not found at path: {file_path}")
            
            # Try to find it by filename only
            potential_path = settings.output_dir / job.output_filename
            print(f"🔍 Trying alternate path: {potential_path}")
            print(f"📁 Alternate exists? {potential_path.exists()}")
            
            if potential_path.exists():
                print(f"✅ Found at alternate location! Using that.")
                file_path = potential_path
            else:
                raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        print(f"✅ File found! Size: {file_path.stat().st_size} bytes")
        
        # Determine media type
        if file_path.suffix == ".zip":
            media_type = "application/zip"
        else:
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
        print(f"📤 Returning file: {job.output_filename}, media_type: {media_type}")
        
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=job.output_filename
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected error in Excel download: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Get shipment generation history"""
    from sqlalchemy import select
    result = await db.execute(
        select(Job)
        .where(Job.job_type == "excel_shipment")
        .order_by(Job.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    
    return {
        "jobs": [job.to_dict() for job in jobs]
    }


@router.delete("/session/{session_id}")
async def cleanup_session(session_id: str):
    """Cleanup session data"""
    if session_id in processors:
        del processors[session_id]
    
    return {"success": True, "message": "Session cleaned up"}