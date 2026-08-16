# backend/tests/test_sb19_financial_history.py
# AUDIT FIX: no test file existed for this router at all -- a full-codebase sweep found it
# still had the fare_amount/completed_at bug (fixed elsewhere in Deliverable 3) plus a
# `t.corrected` reference to a field that doesn't exist (real column: corrected_at).
def test_summary_counts_active_trip_income(client, seeded_rider_with_trips):
    res = client.get("/compliance/financial-history/summary",
                      params={"rider_id": seeded_rider_with_trips, "quick_select": "this_month"})
    assert res.status_code == 200
    assert res.json()["income"] == 1500  # 500 + 700 + 300 from the seeded_rider_with_trips fixture

def test_transactions_list_marks_corrected_and_voided_without_hiding_them(client, seeded_rider_with_trips):
    res = client.get("/compliance/financial-history/transactions",
                      params={"rider_id": seeded_rider_with_trips, "quick_select": "this_month", "type_filter": "trip"})
    assert res.status_code == 200
    assert res.json()["total"] == 3  # BR-SB19-008: nothing hidden by default
