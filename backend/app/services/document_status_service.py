# backend/app/services/document_status_service.py
from datetime import date

# Mirrors cleaned.html's docStatus() exactly (BR-SB18-005)
def document_status(expiry_date: date, today: date) -> str:
    days_left = (expiry_date - today).days
    if days_left < 0: return "expired"
    if days_left <= 1: return "due"
    if days_left <= 30: return "expiring_1mo"
    if days_left <= 60: return "expiring_2mo"
    return "valid"

STATUS_URGENCY = {"expired": 0, "due": 1, "expiring_1mo": 2, "expiring_2mo": 3, "valid": 4}  # BR-SB18-007

# BR-SB18-006: each threshold fires exactly once per document, tracked via its own boolean flags
def check_expiry_reminders(doc, today: date, first_days: int, final_days: int) -> list[str]:
    days_left = (doc.expiry_date - today).days
    fired = []
    if days_left == first_days and not doc.reminder_5day_shown:
        doc.reminder_5day_shown = True
        fired.append("first")  # NTF-SB18-003
    if 0 <= days_left <= final_days and not doc.reminder_3day_shown:
        doc.reminder_3day_shown = True
        fired.append("final")  # NTF-SB18-004, EXC-SB18-006: both can fire the same render if a week was skipped
    return fired
