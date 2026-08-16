# backend/tests/test_sb15_target_streaks.py
from datetime import datetime, timezone
from app.services.target_streak_service import finalize_if_period_ended
from app.models.target_streak import TargetStreak


def test_missed_target_resets_streak_but_keeps_longest(db_session, seeded_target_with_streak_of_3):
    target = seeded_target_with_streak_of_3
    finalize_if_period_ended(db_session, target, datetime.now(timezone.utc))  # period ends unmet
    streak = db_session.query(TargetStreak).filter_by(rider_id=target.rider_id, period_type="daily").first()
    assert streak.current_streak == 0
    assert streak.longest_streak == 3  # BR-SB15-009
