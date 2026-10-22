# backend/app/services/mgr_schedule.py
"""Schedules of a Merry-Go-Round circle. A circle has TWO of them (Stage 1):
    sched         when the pool is PAID OUT
    contrib_sched when members CONTRIBUTE (optional; when missing, members contribute once per payout, as before)
Both use the same shapes as the Smart Boda prototype (v30):

    {"type": "daily",    "days": [0..6]}                     every day except the unticked weekdays (0 = Sunday)
    {"type": "weekly",   "day": 0..6}
    {"type": "twice",    "days": [d1, d2]}                   twice a week
    {"type": "biweekly", "start": "YYYY-MM-DD"}              every 14 days from that date
    {"type": "monthly",  "dom": 1..31, "fix": {"2026-2": 27}}  fixed day of the month; "fix" says what to do in short months
    {"type": "special",  "dates": ["YYYY-MM-DD", ...]}       exceptional cases, every date picked by hand

Weekdays follow the prototype / JavaScript: 0 = Sunday ... 6 = Saturday.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

TYPES = ("daily", "weekly", "twice", "biweekly", "monthly", "special")
DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

def _d(v) -> date:
    if isinstance(v, datetime): return v.date()
    if isinstance(v, date): return v
    return date.fromisoformat(str(v)[:10])

def _wd(d: date) -> int:
    return (d.weekday() + 1) % 7                     # Python Monday=0  ->  Sunday=0

def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"

def validate(s, what: str = "payout") -> dict:
    """Return a clean copy of the schedule or raise ValueError with a rider-friendly message.
    what = "payout" or "contribution": only changes the wording of the messages."""
    w = "contribution" if what == "contribution" else "payout"
    if not isinstance(s, dict) or s.get("type") not in TYPES:
        raise ValueError("Choose how often members contribute." if w == "contribution" else "Choose how often the pool is paid out.")
    t = s["type"]
    days = sorted({int(x) for x in (s.get("days") or [])})
    if any(x < 0 or x > 6 for x in days): raise ValueError("Pick days between Sunday and Saturday.")
    if t == "daily":
        if not days: raise ValueError(f"Tick at least one {w} day.")
        return {"type": t, "days": days}
    if t == "weekly":
        if s.get("day") is None or not 0 <= int(s["day"]) <= 6: raise ValueError(f"Pick the {w} day.")
        return {"type": t, "day": int(s["day"])}
    if t == "twice":
        if len(days) != 2: raise ValueError(f"Pick exactly two {w} days, for example Tuesday and Thursday.")
        return {"type": t, "days": days}
    if t == "biweekly":
        try: return {"type": t, "start": _d(s.get("start")).isoformat()}
        except Exception: raise ValueError(f"Pick the first {w} date. It then repeats every 2 weeks.")
    if t == "monthly":
        dom = int(s.get("dom") or 0)
        if not 1 <= dom <= 31: raise ValueError("Pick the date each month (1 to 31).")
        fix = {}
        for k, v in (s.get("fix") or {}).items():
            y, m = (int(x) for x in str(k).split("-"))
            if not 1 <= int(v) <= monthrange(y, m)[1]: raise ValueError("That date does not exist in that month.")
            fix[f"{y}-{m}"] = int(v)
        return {"type": t, "dom": dom, "fix": fix}
    try: dates = sorted({_d(x).isoformat() for x in (s.get("dates") or [])})
    except Exception: raise ValueError(f"Pick valid {w} dates.")
    if not dates: raise ValueError(f"Pick at least one {w} date.")
    return {"type": t, "dates": dates}

def generate(s: dict, a: date, b: date) -> list:
    """Every payout date from a to b inclusive, oldest first."""
    t, out = s["type"], []
    if t == "special": return [d for d in (date.fromisoformat(x) for x in s.get("dates", [])) if a <= d <= b]
    if t == "biweekly":
        st = _d(s["start"]); k = (a - st).days // 14 if a > st else -((st - a).days // 14)
        d = st + timedelta(days=14 * k)
        while d < a: d += timedelta(days=14)
        while d <= b: out.append(d); d += timedelta(days=14)
        return out
    d = a
    while d <= b:
        w = _wd(d)
        if t in ("daily", "twice") and w in s.get("days", []): out.append(d)
        elif t == "weekly" and w == s["day"]: out.append(d)
        elif t == "monthly":
            dim = monthrange(d.year, d.month)[1]
            want = s["dom"] if s["dom"] <= dim else (s.get("fix") or {}).get(f"{d.year}-{d.month}", dim)
            if d.day == want: out.append(d)
        d += timedelta(days=1)
    return out

def label(s: dict) -> str:
    t = s["type"]
    if t == "daily":
        off = [DAY_SHORT[i] for i in range(7) if i not in s["days"]]
        return "Every day" if not off else "Every day except " + ", ".join(off)
    if t == "weekly": return "Every " + DAY_FULL[s["day"]]
    if t == "twice": return "Every " + " and ".join(DAY_FULL[x] for x in sorted(s["days"]))
    if t == "biweekly": return "Every 2 weeks from " + _d(s["start"]).strftime("%a %d %b")
    if t == "monthly": return "Every month on the " + ordinal(s["dom"])
    return f"Special schedule · {len(s.get('dates', []))} dates"

def next_on_or_after(s: dict, d: date, after: bool = False) -> date:
    """First payout date on/after d (strictly after d when after=True). Falls back to a week later if the schedule has no date."""
    for x in generate(s, d + timedelta(days=1 if after else 0), d + timedelta(days=800)):
        return x
    return d + timedelta(days=7)

def turn_dates(s: dict, first: date, n: int) -> list:
    """Dates of the next n payouts, the first one being `first` (the current round's deadline). Missing dates are None."""
    arr = generate(s, first, first + timedelta(days=60 + 800))
    arr = arr[:n]
    return arr + [None] * (n - len(arr))

def monthly_flags(s: dict, today: Optional[date] = None) -> list:
    """Months too short for a date like the 31st, where the Treasurer should say which day to use (default: the last day)."""
    if s["type"] != "monthly" or s["dom"] < 29: return []
    today = today or date.today(); out = []
    for i in range(12):
        y, m = today.year + (today.month - 1 + i) // 12, (today.month - 1 + i) % 12 + 1
        dim = monthrange(y, m)[1]
        if dim < s["dom"]: out.append({"key": f"{y}-{m}", "days_in_month": dim, "fix": (s.get("fix") or {}).get(f"{y}-{m}")})
    return out


# ───────────────────────────── contributions vs payouts (Stage 1) ─────────────────────────────
def count_between(s: dict, a: date, b: date) -> int:
    """How many dates of schedule s fall from a to b inclusive."""
    return len(generate(s, a, b)) if a <= b else 0

def check_periods(payout: dict, contrib: dict, today: Optional[date] = None, upto: int = 24) -> None:
    """Every payout period must hold at least one contribution date, otherwise members would have nothing to pay before
    that payout (for example monthly contributions with a weekly payout). Checked on the real dates of the next payouts.
    Raises ValueError with a message for the Treasurer."""
    today = today or date.today()
    start = today
    for p in generate(payout, today, today + timedelta(days=1200))[:upto]:
        if count_between(contrib, start, p) < 1:
            raise ValueError(f"Members have no contribution day before the payout on {p.strftime('%a %d %b %Y')}. "
                             "Contributions must happen at least as often as payouts.")
        start = p + timedelta(days=1)

def next_contribution(contrib: dict, today: Optional[date] = None) -> Optional[date]:
    """The next contribution date from today (today included), or None."""
    today = today or date.today()
    for d in generate(contrib, today, today + timedelta(days=800)): return d
    return None

def is_contribution_day(contrib: dict, today: Optional[date] = None) -> bool:
    today = today or date.today()
    return count_between(contrib, today, today) > 0