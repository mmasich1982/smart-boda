# backend/tests/test_sb09_fuel_entry.py
# AUDIT FIX (found while removing docx #4's cost-per-metrics feature): this file was another
# instance of the same corruption pattern found in test_sb13/test_sb18 during the backend
# pass -- four unrelated test files concatenated together, one referencing an undefined
# variable (`bike_current_odo_used_in_fixture`) that was never defined anywhere, confirming
# the fixture it needed was never actually written. Split apart below with a real fixture.
#
# The original test_cost_per_litre_rounds_to_two_decimals is REMOVED, not migrated: that
# feature no longer exists per ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #4.
def test_fuel_entry_saves_litres_and_cost(client, seeded_rider):
    res = client.post("/fuel-maintenance/fuel-entry", params={"rider_id": seeded_rider},
                       json={"mode": "petrol", "litres": 3.5, "cost": 630})
    assert res.status_code == 200
    assert "cost_per_litre" not in res.json()  # docx #4: field removed entirely
