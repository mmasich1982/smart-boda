# backend/app/services/period_range_service.py — shared by SB-13, SB-15, SB-16, SB-17
# ✅ FIXED: Corrected date calculations for "today", "this_week", and "this_month" periods
# Previously used current time as end bound, now uses proper period end boundaries

from datetime import datetime, timedelta, date, timezone

# BR-SB13-003: consistent, device-clock-derived period-start boundaries
# ✅ FIXED: Properly calculates end times for each period instead of using current time (now)
def today_week_month_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if period == "today":
        # ✅ FIXED: Use end of today (start of tomorrow) instead of current time
        today_end = today_start + timedelta(days=1)
        return today_start, today_end
    
    if period == "this_week":
        # ✅ FIXED: Use end of this week (start of Monday next week) instead of current time
        week_start = today_start - timedelta(days=today_start.weekday())  # Monday
        week_end = week_start + timedelta(days=7)  # Start of next Monday
        return week_start, week_end
    
    if period == "this_month":
        # ✅ FIXED: Use end of this month instead of current time
        month_start = today_start.replace(day=1)
        # Get first day of next month
        if now.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)
        return month_start, month_end
    
    raise ValueError("unknown period")

# BR-SB16-009/BR-SB17-010: shared by Savings Report and Send Home History
def month_filter_bounds(period: str, now: datetime, joined_at: datetime) -> tuple[datetime, datetime]:
    if period == "this_month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now
    if period == "last_month":
        first_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = first_this_month - timedelta(seconds=1)
        return last_month_end.replace(day=1, hour=0, minute=0, second=0), first_this_month
    if period == "last_6":
        return now - timedelta(days=182), now
    if period == "since_joining":
        return joined_at, now
    raise ValueError("unknown period")