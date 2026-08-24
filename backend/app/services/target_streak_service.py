# backend/app/services/target_streak_service.py
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.trip import Trip
from app.models.revenue_target import RevenueTarget
from app.models.target_streak import TargetStreak
from app.models.financial_master_data import FinancialRuleConfig
from app.services.period_range_service import today_week_month_bounds

# BR-SB15-003: suggested amounts derived from trailing-week income, per period type
def suggested_target(db: Session, rider_id: str, period_type: str, now: datetime) -> float | None:
    config = db.query(FinancialRuleConfig).get(1)
    trip_count = db.query(Trip).filter_by(rider_id=rider_id).count()
    if trip_count < config.target_min_trip_count:
        return None  # BR-SB15-002, EXC-SB15-002
    week_start, _ = today_week_month_bounds("this_week", now)
    # BUG FIX: Trip's real columns are `amount` / `recorded_at`, not `fare_amount` / `completed_at`.
    week_income = sum(float(t.amount) for t in db.query(Trip)
                      .filter(Trip.rider_id == rider_id, Trip.status == "active", Trip.recorded_at >= week_start))
    daily_avg = week_income / 7
    if period_type == "daily": return round(daily_avg)
    if period_type == "weekly": return round(week_income)
    if period_type == "monthly": return round(week_income * 4.33)  # governed extrapolation factor

# BR-SB15-005: progress always computed live from active trip income, never stored
def target_progress(db: Session, target: RevenueTarget, now: datetime) -> dict:
    period_map = {"daily": "today", "weekly": "this_week", "monthly": "this_month"}
    start, end = today_week_month_bounds(period_map[target.period_type], now)
    # BUG FIX: same fare_amount/completed_at -> amount/recorded_at correction as above.
    earned = sum(float(t.amount) for t in db.query(Trip)
                  .filter(Trip.rider_id == target.rider_id, Trip.status == "active", Trip.recorded_at.between(start, end)))
    pct = min(100, round(earned / float(target.amount) * 100, 1)) if target.amount else 0
    return {"earned": earned, "pct": pct}

# BR-SB15-006: each of 50/75/100 fires exactly once per target period, in ascending order (EXC-SB15-004)
def check_milestones(db: Session, target: RevenueTarget, pct: float, config: FinancialRuleConfig) -> list[int]:
    already = set(int(x) for x in target.milestones_shown.split(",") if x)
    thresholds = sorted(int(x) for x in config.milestone_thresholds_pct.split(","))
    newly_crossed = [t for t in thresholds if t not in already and pct >= t]
    if newly_crossed:
        target.milestones_shown = ",".join(str(x) for x in sorted(already | set(newly_crossed)))
        db.commit()
    return newly_crossed

# BR-SB15-008/009/010: called at the natural end of each period (next trip save or app resume, EXC-SB15-005)
def finalize_if_period_ended(db: Session, target: RevenueTarget, now: datetime):
    streak = db.query(TargetStreak).filter_by(rider_id=target.rider_id, period_type=target.period_type).first() \
             or TargetStreak(rider_id=target.rider_id, period_type=target.period_type)
    progress = target_progress(db, target, now)
    met = progress["earned"] >= float(target.amount)
    if met:
        streak.current_streak += 1
        streak.longest_streak = max(streak.longest_streak, streak.current_streak)
        streak.lifetime_targets_achieved += 1  # BR-SB15-010: combined across all period types
    else:
        streak.current_streak = 0  # BR-SB15-009: neutral reset, no punitive messaging beyond this
    db.merge(streak)
    target.is_active = False
    db.commit()
    return {"met": met, "final_pct": progress["pct"], "final_amount": progress["earned"]}
