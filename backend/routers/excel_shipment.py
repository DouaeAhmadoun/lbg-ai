"""
Excel Shipment API Router
Handles Excel file generation for shipments
"""

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import Response, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import json
from datetime import datetime

from models.database import Job, get_db
from services.excel_service import ShipmentProcessor, create_zip_file, get_market_preview
from utils.helpers import save_job_file
from config.settings import settings

router = APIRouter(prefix="/api/excel", tags=["excel"])

# In-memory storage for processors (simplified - use Redis in production)
processors = {}


@router.post("/upload-client-data")
async def upload_client_data(
    file: UploadFile = File(...),
    session_id: str = Form(...)
):
    """Upload client data from Metabase"""
    try:
        print(f"📥 Received file: {file.filename}, session: {session_id}")
        file_content = await file.read()
        print(f"📄 File size: {len(file_content)} bytes")
        
        processor = ShipmentProcessor()  # Auto-loads templates from templates/
        print(f"✅ ShipmentProcessor created, templates loaded: {processor.get_available_markets()}")
        
        df = processor.load_client_data(file_content)
        print(f"✅ Client data loaded: {len(df)} records")
        
        # Store processor in memory
        processors[session_id] = processor
        print(f"✅ Processor stored in session: {session_id}")
        
        # Get available markets (templates that are loaded)
        available_markets = processor.get_available_markets()
        print(f"🌍 Available markets: {available_markets}")
        
        # Auto-detect markets based on postal codes
        from services.excel_service import detect_markets, validate_shipment_data
        detected_markets = detect_markets(df)
        
        # Suggest markets that have both template AND data
        suggested_markets = [m for m in available_markets if detected_markets.get(m, 0) > 0]
        
        print(f"🔍 Detected markets: {detected_markets}")
        print(f"💡 Suggested markets: {suggested_markets}")
        
        # Run validation for suggested markets
        validation_reports = {}
        for market in suggested_markets:
            validation_report = validate_shipment_data(df, market)
            validation_reports[market] = validation_report
            print(f"📋 {market} validation: {validation_report['valid_rows']}/{validation_report['total_rows']} valid")
        
        response = {
            "success": True,
            "total_records": len(df),
            "columns": list(df.columns),
            "preview": df.head(5).to_dict('records'),
            "available_markets": available_markets,
            "detected_markets": detected_markets,  # {'IT': 15, 'FR': 8, 'ES': 0}
            "suggested_markets": suggested_markets,  # ['IT', 'FR'] - markets with data
            "validation_reports": validation_reports  # Validation dès l'upload!
        }
        
        print(f"✅ Returning response with {len(available_markets)} markets")
        return response
    
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
        from pathlib import Path
        from datetime import datetime
        
        templates_dir = Path("templates")
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
        from pathlib import Path
        
        templates_dir = Path("templates")
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


@router.get("/preview/{market}")
async def preview_market(
    market: str,
    session_id: str,
    filter_mode: str = "auto"
):
    """Preview data for a specific market"""
    try:
        if session_id not in processors:
            raise HTTPException(status_code=400, detail="Session not found")
        
        processor = processors[session_id]
        preview = get_market_preview(processor, market, filter_mode)
        
        return preview
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate")
async def generate_shipment_files(
    session_id: str = Form(...),
    markets: str = Form(...),  # JSON string
    filter_mode: str = Form("auto"),
    manual_filters: str = Form("{}"),  # JSON string
    db: AsyncSession = Depends(get_db)
):
    """Generate shipment files for selected markets"""
    try:
        print(f"🎯 Generate called - session: {session_id}, markets: {markets}")
        
        if session_id not in processors:
            print(f"❌ Session {session_id} not found in processors")
            raise HTTPException(status_code=400, detail="Session not found")
        
        processor = processors[session_id]
        markets_list = json.loads(markets)
        manual_filters_dict = json.loads(manual_filters) if manual_filters != "{}" else None
        
        print(f"📋 Markets list: {markets_list}, filter_mode: {filter_mode}")
        print(f"🗂️  Processor has templates for: {processor.get_available_markets()}")
        
        # Create job record
        job = Job(
            job_type="excel_shipment",
            status="processing",
            input_filename="client_data.xlsx",
            settings_used={
                "markets": markets_list,
                "filter_mode": filter_mode
            }
        )
        
        db.add(job)
        await db.commit()
        await db.refresh(job)
        
        print(f"✅ Job {job.id} created, generating files...")
        
        # Validate data before generating
        from services.excel_service import validate_shipment_data
        validation_reports = {}
        
        for market in markets_list:
            validation_report = validate_shipment_data(processor.client_data, market)
            validation_reports[market] = validation_report
            print(f"📋 {market} validation: {validation_report['valid_rows']}/{validation_report['total_rows']} valid, "
                  f"{len(validation_report['blocking_errors'])} errors, "
                  f"{len(validation_report['warnings'])} warnings")
        
        # Generate files
        generated_files = processor.generate_all_files(
            markets_list,
            filter_mode,
            manual_filters_dict
        )
        
        print(f"📦 Generated files: {list(generated_files.keys()) if generated_files else 'NONE'}")
        
        if not generated_files:
            print(f"❌ No files generated!")
            job.status = "failed"
            job.error_message = "No files generated"
            await db.commit()
            raise HTTPException(status_code=400, detail="No files generated")
        
        # Save files and update job
        from services.excel_service import MARKET_NAMES
        
        saved_files = {}
        # Format: 2026-02-25_14h30 (lisible et court)
        timestamp = datetime.now().strftime('%Y-%m-%d_%Hh%M')
        
        for market, file_bytes in generated_files.items():
            market_name = MARKET_NAMES.get(market, market)  # Italy, France, Spain
            filename = f"Shipment_{market_name}_{timestamp}.xlsx"
            file_path = save_job_file(file_bytes, filename, "outputs")
            saved_files[market] = str(file_path)
        
        # Create ZIP if multiple files
        if len(generated_files) > 1:
            # Create descriptive ZIP name with all markets
            market_names = [MARKET_NAMES.get(m, m) for m in sorted(generated_files.keys())]
            zip_filename = f"Shipments_{'_'.join(market_names)}_{timestamp}.zip"
            zip_bytes = create_zip_file(generated_files, timestamp)  # Pass timestamp to create_zip_file
            zip_path = save_job_file(zip_bytes, zip_filename, "outputs")
            saved_files["zip"] = str(zip_path)
        
        # Update job
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        job.output_path = saved_files.get("zip", list(saved_files.values())[0])
        
        # Set proper filename for download
        if "zip" in saved_files:
            # Multiple markets → ZIP
            market_names = [MARKET_NAMES.get(m, m) for m in sorted(generated_files.keys())]
            job.output_filename = f"Shipments_{'_'.join(market_names)}_{timestamp}.zip"
        else:
            # Single market → Excel file
            market = list(generated_files.keys())[0]
            market_name = MARKET_NAMES.get(market, market)
            job.output_filename = f"Shipment_{market_name}_{timestamp}.xlsx"
        
        await db.commit()
        
        return {
            "job_id": job.id,
            "status": "completed",
            "files": saved_files,
            "markets": list(generated_files.keys()),
            "validation_reports": validation_reports  # Include validation reports
        }
    
    except Exception as e:
        # Update job with error
        if 'job' in locals():
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()
        
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