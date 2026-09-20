# backend/app/routers/location_public_api.py
# Public Location API - Accessible to all users (no admin auth required)
# Provides endpoints for fetching counties, sub-counties, and wards

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.database import get_db
from app.models.location_models import County, SubCounty, Ward
import logging

logger = logging.getLogger(__name__)

# ✅ IMPORTANT: Using /location-data prefix instead of /master-data to avoid conflicts
router = APIRouter(prefix="/location-data", tags=["location-api"])

# ✅ DEBUG: Health check endpoint to verify route registration
@router.get("/health", tags=["location-public"])
async def location_health_check():
    """Health check endpoint for location API."""
    logger.info("Location API health check requested")
    return {"status": "ok", "service": "location-data-api"}

# =============================================================================
# PUBLIC County Endpoints (No Authentication Required)
# =============================================================================

@router.get("/counties", tags=["location-public"])
async def get_counties(
    search: str = Query(None, description="Search by county name"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch all active counties with optional search filtering.
    
    This endpoint is PUBLIC and does not require authentication.
    
    Query Parameters:
    - search: Filter counties by name or code (case-insensitive partial match)
    - skip: Pagination offset (default: 0)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Returns:
    - List of counties sorted by name with id, name, and code
    
    ✅ Status Code: 200 OK
    """
    try:
        logger.info(f"Fetching counties: search={search}, skip={skip}, limit={limit}")
        query = db.query(County).filter(County.is_active == True)
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    County.county_name.ilike(search_term),
                    County.county_code.ilike(search_term)
                )
            )
        
        counties = query.order_by(County.county_name).offset(skip).limit(limit).all()
        logger.info(f"Successfully fetched {len(counties)} counties")
        
        return {
            "status": "success",
            "data": [
                {
                    "id": county.id,
                    "name": county.county_name,
                    "code": county.county_code,
                }
                for county in counties
            ],
            "count": len(counties)
        }
    except Exception as e:
        logger.error(f"Error fetching counties: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Error fetching counties: {str(e)}"
        )


@router.get("/counties/{county_id}")
async def get_county_detail(
    county_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific county by ID.
    """
    try:
        county = db.query(County).filter(
            and_(
                County.id == county_id,
                County.is_active == True
            )
        ).first()
        
        if not county:
            raise HTTPException(status_code=404, detail="County not found")
        
        return {
            "status": "success",
            "data": {
                "id": county.id,
                "name": county.county_name,
                "code": county.county_code,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching county {county_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching county: {str(e)}")


# =============================================================================
# PUBLIC Sub-County Endpoints (No Authentication Required)
# =============================================================================

@router.get("/sub-counties")
async def get_sub_counties(
    county_id: int = Query(..., description="Filter by county ID (REQUIRED)"),
    search: str = Query(None, description="Search by sub-county name"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch sub-counties for a specific county with optional search filtering.
    
    Query Parameters:
    - county_id: Parent county ID (REQUIRED) - enables efficient cascading selection
    - search: Filter by name or code (case-insensitive partial match)
    - skip: Pagination offset (default: 0)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Returns:
    - List of sub-counties sorted by name
    """
    try:
        query = db.query(SubCounty).filter(
            and_(
                SubCounty.county_id == county_id,
                SubCounty.is_active == True
            )
        )
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    SubCounty.sub_county_name.ilike(search_term),
                    SubCounty.sub_county_code.ilike(search_term)
                )
            )
        
        sub_counties = query.order_by(SubCounty.sub_county_name).offset(skip).limit(limit).all()
        
        return {
            "status": "success",
            "data": [
                {
                    "id": sc.id,
                    "name": sc.sub_county_name,
                    "code": sc.sub_county_code,
                    "county_id": sc.county_id,
                }
                for sc in sub_counties
            ],
            "count": len(sub_counties)
        }
    except Exception as e:
        logger.error(f"Error fetching sub-counties: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching sub-counties: {str(e)}"
        )


@router.get("/sub-counties/{sub_county_id}")
async def get_sub_county_detail(
    sub_county_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific sub-county by ID.
    """
    try:
        sub_county = db.query(SubCounty).filter(
            and_(
                SubCounty.id == sub_county_id,
                SubCounty.is_active == True
            )
        ).first()
        
        if not sub_county:
            raise HTTPException(status_code=404, detail="Sub-county not found")
        
        return {
            "status": "success",
            "data": {
                "id": sub_county.id,
                "name": sub_county.sub_county_name,
                "code": sub_county.sub_county_code,
                "county_id": sub_county.county_id,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sub-county {sub_county_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching sub-county: {str(e)}")


# =============================================================================
# PUBLIC Ward Endpoints (No Authentication Required)
# =============================================================================

@router.get("/wards")
async def get_wards(
    sub_county_id: int = Query(None, description="Filter by sub-county ID (preferred)"),
    county_id: int = Query(None, description="Filter by county ID (alternative)"),
    search: str = Query(None, description="Search by ward name"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch wards with optional filtering by sub-county or county.
    
    Query Parameters:
    - sub_county_id: Filter by parent sub-county (preferred for efficiency)
    - county_id: Filter by county (if sub_county_id not provided)
    - search: Filter by name or code (case-insensitive partial match)
    - skip: Pagination offset (default: 0)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Note: Either sub_county_id or county_id must be provided
    
    Returns:
    - List of wards sorted by name
    """
    try:
        query = db.query(Ward).filter(Ward.is_active == True)
        
        # Intelligent filtering: prefer sub_county_id for efficiency
        if sub_county_id:
            query = query.filter(Ward.sub_county_id == sub_county_id)
        elif county_id:
            query = query.filter(Ward.county_id == county_id)
        else:
            raise HTTPException(
                status_code=400,
                detail="Either sub_county_id or county_id parameter is required"
            )
        
        # Optional: Search by name or code
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    Ward.ward_name.ilike(search_term),
                    Ward.ward_code.ilike(search_term)
                )
            )
        
        wards = query.order_by(Ward.ward_name).offset(skip).limit(limit).all()
        
        return {
            "status": "success",
            "data": [
                {
                    "id": ward.id,
                    "name": ward.ward_name,
                    "code": ward.ward_code,
                    "sub_county_id": ward.sub_county_id,
                    "county_id": ward.county_id,
                }
                for ward in wards
            ],
            "count": len(wards)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching wards: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching wards: {str(e)}"
        )


@router.get("/wards/{ward_id}")
async def get_ward_detail(
    ward_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific ward by ID.
    """
    try:
        ward = db.query(Ward).filter(
            and_(
                Ward.id == ward_id,
                Ward.is_active == True
            )
        ).first()
        
        if not ward:
            raise HTTPException(status_code=404, detail="Ward not found")
        
        return {
            "status": "success",
            "data": {
                "id": ward.id,
                "name": ward.ward_name,
                "code": ward.ward_code,
                "sub_county_id": ward.sub_county_id,
                "county_id": ward.county_id,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ward {ward_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching ward: {str(e)}")


# ============================================================================
# ✅ MODULE EXPORT
# ============================================================================
__all__ = ['router']