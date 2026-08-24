# backend/tests/test_sb16_savings_tracker.py
from app.services.savings_service import add_savings_contribution


def test_contribution_updates_lifetime_total(db_session, seeded_sacco_account):
    add_savings_contribution(db_session, seeded_sacco_account.id, 500)  # BR-SB16-006
    db_session.refresh(seeded_sacco_account)
    assert float(seeded_sacco_account.lifetime_total) == 500


def test_period_filter_never_changes_lifetime_total(client, db_session, seeded_savings_account):
    rider_id = str(seeded_savings_account.rider_id)
    res_month = client.get("/financial/savings/report", params={"rider_id": rider_id, "period": "this_month"})
    res_since = client.get("/financial/savings/report", params={"rider_id": rider_id, "period": "since_joining"})
    a1 = res_month.json()["accounts"][0]["lifetime_total"]
    a2 = res_since.json()["accounts"][0]["lifetime_total"]
    assert a1 == a2  # BR-SB16-009
