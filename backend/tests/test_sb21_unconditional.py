# backend/tests/test_sb21_unconditional.py
def test_export_request_works_even_when_rider_locked(client, seeded_locked_rider):
    res = client.post("/compliance/data-export", params={
        "rider_id": seeded_locked_rider, "contact_email": "rider@example.com",
        "reason_code": "personal_records", "pin_verified": True,
    })
    assert res.status_code == 200  # BR-SB21-001/002: no lock-state branch to even fail on
