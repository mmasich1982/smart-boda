# backend/tests/test_sb13_net_profit.py
from app.services.net_profit_service import net_profit_summary
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc)


# AUDIT FIX (MVP0 §07): this file previously concatenated four unrelated test files together
# with a Python syntax error (a bare `EXC-SB13-004` token with no `#`). Split back into its
# correctly-named file below; the sb16/sb15 tests that were also embedded here now live in
# test_sb16_savings_tracker.py and test_sb15_target_streaks.py respectively.
def test_net_profit_can_go_negative(db_session, seeded_rider_with_expenses_over_income):
    summary = net_profit_summary(db_session, seeded_rider_with_expenses_over_income, "today", now())
    assert summary["net_profit"] < 0  # EXC-SB13-004
