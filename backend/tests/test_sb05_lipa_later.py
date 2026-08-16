# backend/tests/test_sb05_lipa_later.py
from datetime import date, timedelta


def test_lipa_later_creates_trip_and_record(client, seeded_rider):
    res = client.post("/trips/lipa-later", params={"rider_id": seeded_rider}, json={
        "customer_name": "Jane Wanjiru", "customer_mobile": "0722000111",
        "amount": 350, "due_date": str(date.today() + timedelta(days=3)),
    })
    assert res.status_code == 200
    assert res.json()["trip_id"]

def test_overdue_record_is_flagged(client, seeded_rider):
    client.post("/trips/lipa-later", params={"rider_id": seeded_rider}, json={
        "customer_name": "Peter Otieno", "customer_mobile": "0733000222",
        "amount": 500, "due_date": str(date.today() - timedelta(days=2)),
    })
    rows = client.get("/trips/lipa-later", params={"rider_id": seeded_rider}).json()
    assert rows[0]["is_overdue"] is True

def test_mark_paid_removes_from_pending_list(client, seeded_rider):
    created = client.post("/trips/lipa-later", params={"rider_id": seeded_rider}, json={
        "customer_name": "Mary Achieng", "customer_mobile": "0711000333",
        "amount": 200, "due_date": str(date.today() + timedelta(days=1)),
    }).json()
    client.patch(f"/trips/lipa-later/{created['id']}/mark-paid")
    rows = client.get("/trips/lipa-later", params={"rider_id": seeded_rider}).json()
    assert rows == []
