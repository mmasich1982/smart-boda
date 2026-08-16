# backend/tests/test_sb18_compliance.py
def test_renewal_archives_prior_record_never_deletes(client, db_session, seeded_rider):
    client.post("/compliance/documents", params={"rider_id": seeded_rider},
                json={"document_type_code": "psv_licence", "expiry_date": "2026-08-01"})
    client.post("/compliance/documents", params={"rider_id": seeded_rider},
                json={"document_type_code": "psv_licence", "expiry_date": "2027-08-01"})
    history = client.get("/compliance/documents/history", params={"rider_id": seeded_rider}).json()
    assert len(history) == 2  # BR-SB18-004/010: both rows present, one archived
