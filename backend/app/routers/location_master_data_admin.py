# backend/app/routers/location_master_data_admin.py
# Location Master Data API Endpoints
# Provides endpoints for fetching counties, sub-counties, and wards with filtering

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.database import get_db
from app.models.location import County, SubCounty, Ward
from app.auth import verify_admin_token

router = APIRouter(prefix="/master-data", tags=["location-master-data"])

# =============================================================================
# County Endpoints
# =============================================================================

@router.get("/counties")
async def get_counties(
    search: str = Query(None, description="Search by county name"),
    is_active: bool = Query(True, description="Filter by active status"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch all counties with optional search filtering
    
    Query Parameters:
    - search: Filter counties by name (case-insensitive partial match)
    - is_active: Include only active counties (default: True)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Returns:
    - List of counties sorted by name
    """
    try:
        query = db.query(County).filter(County.is_active == is_active)
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    County.county_name.ilike(search_term),
                    County.county_code.ilike(search_term)
                )
            )
        
        counties = query.order_by(County.county_name).limit(limit).all()
        
        return [
            {
                "id": county.id,
                "county_code": county.county_code,
                "county_name": county.county_name,
                "is_active": county.is_active,
            }
            for county in counties
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching counties: {str(e)}")


@router.get("/counties/{county_id}")
async def get_county_detail(
    county_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific county by ID
    
    Parameters:
    - county_id: ID of the county to retrieve
    
    Returns:
    - County details with full information
    """
    try:
        county = db.query(County).filter(County.id == county_id).first()
        
        if not county:
            raise HTTPException(status_code=404, detail="County not found")
        
        return {
            "id": county.id,
            "county_code": county.county_code,
            "county_name": county.county_name,
            "is_active": county.is_active,
            "created_at": county.created_at,
            "updated_at": county.updated_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching county: {str(e)}")


# =============================================================================
# Sub-County Endpoints
# =============================================================================

@router.get("/sub-counties")
async def get_sub_counties(
    county_id: int = Query(None, description="Filter by county ID"),
    search: str = Query(None, description="Search by sub-county name"),
    is_active: bool = Query(True, description="Filter by active status"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch sub-counties with optional filtering
    
    Query Parameters:
    - county_id: Filter sub-counties by parent county (required for efficient filtering)
    - search: Filter sub-counties by name (case-insensitive partial match)
    - is_active: Include only active sub-counties (default: True)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Returns:
    - List of sub-counties sorted by name
    
    Note: When county_id is provided, search is performed within that county's sub-counties
    """
    try:
        query = db.query(SubCounty).filter(SubCounty.is_active == is_active)
        
        # Required: Filter by county to enable intelligent cascading
        if not county_id:
            raise HTTPException(status_code=400, detail="county_id parameter is required")
        
        query = query.filter(SubCounty.county_id == county_id)
        
        # Optional: Search by name or code
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    SubCounty.sub_county_name.ilike(search_term),
                    SubCounty.sub_county_code.ilike(search_term)
                )
            )
        
        sub_counties = query.order_by(SubCounty.sub_county_name).limit(limit).all()
        
        return [
            {
                "id": sub_county.id,
                "sub_county_code": sub_county.sub_county_code,
                "sub_county_name": sub_county.sub_county_name,
                "county_id": sub_county.county_id,
                "is_active": sub_county.is_active,
            }
            for sub_county in sub_counties
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sub-counties: {str(e)}")


@router.get("/sub-counties/{sub_county_id}")
async def get_sub_county_detail(
    sub_county_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific sub-county by ID
    
    Parameters:
    - sub_county_id: ID of the sub-county to retrieve
    
    Returns:
    - Sub-county details with full information
    """
    try:
        sub_county = db.query(SubCounty).filter(SubCounty.id == sub_county_id).first()
        
        if not sub_county:
            raise HTTPException(status_code=404, detail="Sub-county not found")
        
        return {
            "id": sub_county.id,
            "sub_county_code": sub_county.sub_county_code,
            "sub_county_name": sub_county.sub_county_name,
            "county_id": sub_county.county_id,
            "is_active": sub_county.is_active,
            "created_at": sub_county.created_at,
            "updated_at": sub_county.updated_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sub-county: {str(e)}")


# =============================================================================
# Ward Endpoints
# =============================================================================

@router.get("/wards")
async def get_wards(
    sub_county_id: int = Query(None, description="Filter by sub-county ID"),
    county_id: int = Query(None, description="Filter by county ID (alternative to sub_county_id)"),
    search: str = Query(None, description="Search by ward name"),
    is_active: bool = Query(True, description="Filter by active status"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results to return"),
    db: Session = Depends(get_db)
):
    """
    Fetch wards with optional filtering
    
    Query Parameters:
    - sub_county_id: Filter wards by parent sub-county (preferred for efficiency)
    - county_id: Alternative filter by county (if sub_county_id not provided)
    - search: Filter wards by name (case-insensitive partial match)
    - is_active: Include only active wards (default: True)
    - limit: Maximum number of results (default: 100, max: 500)
    
    Returns:
    - List of wards sorted by name
    
    Note: At least one of sub_county_id or county_id must be provided
    """
    try:
        query = db.query(Ward).filter(Ward.is_active == is_active)
        
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
        
        wards = query.order_by(Ward.ward_name).limit(limit).all()
        
        return [
            {
                "id": ward.id,
                "ward_code": ward.ward_code,
                "ward_name": ward.ward_name,
                "sub_county_id": ward.sub_county_id,
                "county_id": ward.county_id,
                "is_active": ward.is_active,
            }
            for ward in wards
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching wards: {str(e)}")


@router.get("/wards/{ward_id}")
async def get_ward_detail(
    ward_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch a specific ward by ID
    
    Parameters:
    - ward_id: ID of the ward to retrieve
    
    Returns:
    - Ward details with full information
    """
    try:
        ward = db.query(Ward).filter(Ward.id == ward_id).first()
        
        if not ward:
            raise HTTPException(status_code=404, detail="Ward not found")
        
        return {
            "id": ward.id,
            "ward_code": ward.ward_code,
            "ward_name": ward.ward_name,
            "sub_county_id": ward.sub_county_id,
            "county_id": ward.county_id,
            "is_active": ward.is_active,
            "created_at": ward.created_at,
            "updated_at": ward.updated_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ward: {str(e)}")


# =============================================================================
# Admin-Only Management Endpoints (Optional - for future use)
# =============================================================================

@router.post("/counties", dependencies=[Depends(verify_admin_token)])
async def create_county(
    county_code: str,
    county_name: str,
    db: Session = Depends(get_db)
):
    """
    Create a new county (Admin only)
    """
    try:
        new_county = County(
            county_code=county_code,
            county_name=county_name,
            is_active=True
        )
        db.add(new_county)
        db.commit()
        db.refresh(new_county)
        
        return {
            "id": new_county.id,
            "county_code": new_county.county_code,
            "county_name": new_county.county_name,
            "is_active": new_county.is_active,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating county: {str(e)}")


@router.post("/sub-counties", dependencies=[Depends(verify_admin_token)])
async def create_sub_county(
    sub_county_code: str,
    sub_county_name: str,
    county_id: int,
    db: Session = Depends(get_db)
):
    """
    Create a new sub-county (Admin only)
    """
    try:
        # Verify county exists
        county = db.query(County).filter(County.id == county_id).first()
        if not county:
            raise HTTPException(status_code=404, detail="County not found")
        
        new_sub_county = SubCounty(
            sub_county_code=sub_county_code,
            sub_county_name=sub_county_name,
            county_id=county_id,
            is_active=True
        )
        db.add(new_sub_county)
        db.commit()
        db.refresh(new_sub_county)
        
        return {
            "id": new_sub_county.id,
            "sub_county_code": new_sub_county.sub_county_code,
            "sub_county_name": new_sub_county.sub_county_name,
            "county_id": new_sub_county.county_id,
            "is_active": new_sub_county.is_active,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating sub-county: {str(e)}")


@router.post("/wards", dependencies=[Depends(verify_admin_token)])
async def create_ward(
    ward_code: str,
    ward_name: str,
    sub_county_id: int,
    county_id: int,
    db: Session = Depends(get_db)
):
    """
    Create a new ward (Admin only)
    """
    try:
        # Verify sub-county exists
        sub_county = db.query(SubCounty).filter(SubCounty.id == sub_county_id).first()
        if not sub_county:
            raise HTTPException(status_code=404, detail="Sub-county not found")
        
        new_ward = Ward(
            ward_code=ward_code,
            ward_name=ward_name,
            sub_county_id=sub_county_id,
            county_id=county_id,
            is_active=True
        )
        db.add(new_ward)
        db.commit()
        db.refresh(new_ward)
        
        return {
            "id": new_ward.id,
            "ward_code": new_ward.ward_code,
            "ward_name": new_ward.ward_name,
            "sub_county_id": new_ward.sub_county_id,
            "county_id": new_ward.county_id,
            "is_active": new_ward.is_active,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating ward: {str(e)}")
