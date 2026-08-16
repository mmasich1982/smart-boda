# backend/app/routers/pin.py
# FIXED: Added endpoint to retrieve rider details after PIN creation
# This fixes the blank screen issue after PIN creation by providing
# the frontend with necessary data to initialize the home screen

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.rider import Rider
from app.models.bike_profile import BikeProfile
from app.models.pin_recovery_request import PinRecoveryRequest
from app.schemas.onboarding import PinCreateRequest, PinLoginRequest, PinRecoveryConfirmRequest
from app.services.pin_service import create_pin, verify_pin_login, reset_pin_via_recovery

router = APIRouter(prefix="/onboarding", tags=["sb-04"])

@router.post("/pin/create")
def pin_create(payload: PinCreateRequest, rider_id: str = Query(...), db: Session = Depends(get_db)):
    return create_pin(db, rider_id, payload.pin, payload.pin_confirm)


@router.get("/rider-details/{rider_id}")
def get_rider_details(rider_id: str, db: Session = Depends(get_db)):
    """
    FIXED: New endpoint to fetch rider profile data after PIN creation.
    This endpoint returns all data needed by HomeScreen to initialize.
    
    Returns:
        {
            "ok": true,
            "rider": {
                "rider_id": uuid,
                "mobile_number": string,
                "registration_status": "active" | "verified_incomplete",
                "onboarding_step": string
            },
            "bike_profile": {
                "id": uuid,
                "number_plate": string,
                "fuel_type_code": string
            },
            "account": {
                "rider_id": uuid,
                "mobile_number": string,
                "registration_status": string
            }
        }
    """
    try:
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Get active bike profile
        bike = db.query(BikeProfile).filter(
            BikeProfile.rider_id == rider_id
        ).order_by(BikeProfile.submitted_at.desc()).first()
        
        return {
            "ok": True,
            "rider": {
                "rider_id": str(rider.id),
                "mobile_number": rider.mobile_number,
                "registration_status": rider.registration_status,
                "onboarding_step": rider.onboarding_step or "createPin"
            },
            "bike_profile": {
                "id": str(bike.id) if bike else None,
                "number_plate": bike.number_plate if bike else None,
                "fuel_type_code": bike.fuel_type_code if bike else None
            } if bike else None,
            "account": {
                "rider_id": str(rider.id),
                "mobile_number": rider.mobile_number,
                "registration_status": rider.registration_status
            }
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Error fetching rider details: {str(err)}")


@router.post("/pin/login")
def pin_login(payload: PinLoginRequest, db: Session = Depends(get_db)):
    return verify_pin_login(db, payload.rider_id, payload.pin)

# BR-SB04-007: recovery ALWAYS requires manual Super Admin verification against the registered number —
# same Rider Account Support queue used for mobile-number verification and duplicate-plate cases.
@router.post("/pin/recovery/start")
def pin_recovery_start(rider_id: str = Query(...), db: Session = Depends(get_db)):
    rider = db.query(Rider).get(rider_id)
    request = PinRecoveryRequest(rider_id=rider.id, mobile_number=rider.mobile_number, status="pending")
    db.add(request)
    db.commit()
    db.refresh(request)
    return {"recovery_request_id": str(request.id), "status": request.status}  # NTF-SB04-004

@router.get("/pin/recovery/status")
def pin_recovery_status(recovery_request_id: str, db: Session = Depends(get_db)):
    request = db.query(PinRecoveryRequest).get(recovery_request_id)
    return {"status": request.status}  # "pending" | "approved"

@router.post("/pin/recovery/confirm")
def pin_recovery_confirm(payload: PinRecoveryConfirmRequest, rider_id: str = Query(...), db: Session = Depends(get_db)):
    request = db.query(PinRecoveryRequest).get(payload.recovery_request_id)
    if not request or request.status != "approved":
        raise HTTPException(status_code=403, detail="This request has not been approved yet.")
    return reset_pin_via_recovery(db, rider_id, payload.new_pin, payload.new_pin_confirm)  # BR-SB04-008