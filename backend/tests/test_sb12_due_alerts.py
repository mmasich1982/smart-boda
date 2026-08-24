# backend/tests/test_sb12_due_alerts.py
from app.services.due_alert_service import all_due_alerts

def test_oil_change_next_due_uses_selected_oil_interval(db_session, seeded_rider_with_bike_and_oil_change):
    # entry logged at 14000 km using Full Synthetic (7000 km interval); bike now at 14820 km
    rider_id = seeded_rider_with_bike_and_oil_change
    alerts = all_due_alerts(db_session, rider_id)
    oil = next(a for a in alerts if a["service_type"] == "Oil Change")
    assert oil["remaining_km"] == (14000 + 7000) - 14820  # BR-SB12-004/007
