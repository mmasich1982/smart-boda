# backend/tests/test_mobile_number.py
from app.models.rider import Rider

def test_duplicate_verified_number_rejected(client, db_session):
    db_session.add(Rider(mobile_number="0722000000", mobile_verified=True)); db_session.commit()
    res = client.post("/onboarding/mobile-number", json={"mobile_number": "0722000000"})
    assert res.status_code == 409  # EXC-SB03-001

# backend/tests/test_sb04_pin_recovery.py
from app.models.pin_recovery_request import PinRecoveryRequest

def test_recovery_confirm_rejected_until_admin_approves(client, db_session):
    rider = Rider(mobile_number="0722000001"); db_session.add(rider); db_session.commit()
    request = PinRecoveryRequest(rider_id=rider.id, mobile_number=rider.mobile_number, status="pending")
    db_session.add(request); db_session.commit()

    res = client.post("/onboarding/pin/recovery/confirm",
        json={"recovery_request_id": str(request.id), "new_pin": "5555", "new_pin_confirm": "5555"},
        params={"rider_id": str(rider.id)})
    assert res.status_code == 403  # EXC-SB04-011: not yet approved

    request.status = "approved"; db_session.commit()
    res = client.post("/onboarding/pin/recovery/confirm",
        json={"recovery_request_id": str(request.id), "new_pin": "5555", "new_pin_confirm": "5555"},
        params={"rider_id": str(rider.id)})
    assert res.status_code == 200
