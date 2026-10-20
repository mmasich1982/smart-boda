# backend/app/services/notification_service.py
from datetime import datetime, timezone
from app.models.boda_group import AppNotification

def notify(db, rtype, rid, kind, title, body, ref_type, ref_id):
    """Create an ACTIVE on-screen notification. Never SMS, never email."""
    db.add(AppNotification(recipient_type=rtype, recipient_id=rid, kind=kind, title=title,
                           body=body, ref_type=ref_type, ref_id=ref_id))

def complete(db, ref_type, ref_id, reason="action_done", recipient_type=None, kind=None):
    """Lifecycle: mark matching ACTIVE notifications completed so they leave the queue."""
    q = db.query(AppNotification).filter(AppNotification.ref_type == ref_type,
        AppNotification.ref_id == ref_id, AppNotification.status == "active")
    if recipient_type: q = q.filter(AppNotification.recipient_type == recipient_type)
    if kind: q = q.filter(AppNotification.kind == kind)
    q.update({"status": "completed", "completion_reason": reason,
              "completed_at": datetime.now(timezone.utc)}, synchronize_session=False)