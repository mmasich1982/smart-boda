# backend/tests/test_sb20_statements.py
def test_statement_figures_frozen_after_new_expense_logged(client, db_session, seeded_rider_with_trips):
    stmt = client.post("/compliance/statements", params={"rider_id": seeded_rider_with_trips, "online": True},
                        json={"period_start": "2020-01-01", "period_end": "2030-12-31"}).json()
    original_net = client.get(f"/compliance/statements/{stmt['id']}").json()["net_profit"]
    client.post("/financial/other-expense", params={"rider_id": seeded_rider_with_trips},
                json={"category_code": "other", "amount": 5000})  # backdated into the same period
    unchanged_net = client.get(f"/compliance/statements/{stmt['id']}").json()["net_profit"]
    assert original_net == unchanged_net  # BR-SB20-009/EXC-SB20-007
