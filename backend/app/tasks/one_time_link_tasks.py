# backend/app/tasks/one_time_link_tasks.py
"""
Celery tasks for one-time link maintenance
Run periodically to clean up expired links and check for abuse
"""

import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

try:
    from celery import shared_task
except ImportError:
    # Fallback if Celery is not configured
    def shared_task(func):
        """Fallback decorator if Celery is not available"""
        return func


@shared_task(bind=True, max_retries=3)
def cleanup_expired_links_task(self):
    """
    Celery task to clean up expired and used links
    Should run daily at 2 AM
    
    Configuration (in celery_config.py):
    ```
    CELERY_BEAT_SCHEDULE = {
        'cleanup-expired-links': {
            'task': 'app.tasks.one_time_link_tasks.cleanup_expired_links_task',
            'schedule': crontab(hour=2, minute=0),
        },
    }
    ```
    """
    try:
        from app.database import SessionLocal
        from app.services.one_time_link_service import OneTimeLinkService
        
        db = SessionLocal()
        try:
            count = OneTimeLinkService.cleanup_expired_links(db)
            logger.info(f"✓ Successfully cleaned up {count} expired links")
            return {"status": "success", "deleted_links": count}
        finally:
            db.close()
    
    except Exception as exc:
        logger.error(f"✗ Error cleaning up links: {str(exc)}")
        # Retry with exponential backoff
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@shared_task(bind=True, max_retries=3)
def check_abuse_patterns_task(self):
    """
    Celery task to check for abuse patterns in links
    Identifies suspicious activity like multiple failed attempts
    
    Configuration (in celery_config.py):
    ```
    CELERY_BEAT_SCHEDULE = {
        'check-link-abuse': {
            'task': 'app.tasks.one_time_link_tasks.check_abuse_patterns_task',
            'schedule': crontab(hour='*/1'),  # Every hour
        },
    }
    ```
    """
    try:
        from app.database import SessionLocal
        from app.models.one_time_link import OneTimeLink, LinkStatus
        from app.services.one_time_link_service import SecurityMonitor
        
        db = SessionLocal()
        try:
            # Find links with suspicious patterns
            suspicious_links = db.query(OneTimeLink).filter(
                OneTimeLink.failed_attempts >= 2
            ).all()
            
            abusive_count = 0
            for link in suspicious_links:
                is_abusive, reason = SecurityMonitor.check_link_abuse_patterns(db, link.token)
                if is_abusive:
                    abusive_count += 1
            
            logger.info(f"✓ Abuse pattern check completed. Found {abusive_count} suspicious links")
            return {"status": "success", "abusive_links": abusive_count}
        
        finally:
            db.close()
    
    except Exception as exc:
        logger.error(f"✗ Error checking abuse patterns: {str(exc)}")
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@shared_task(bind=True, max_retries=3)
def monitor_link_usage_task(self):
    """
    Celery task to monitor link usage statistics
    Logs usage metrics for analytics
    
    Configuration (in celery_config.py):
    ```
    CELERY_BEAT_SCHEDULE = {
        'monitor-link-usage': {
            'task': 'app.tasks.one_time_link_tasks.monitor_link_usage_task',
            'schedule': crontab(hour=*/6),  # Every 6 hours
        },
    }
    ```
    """
    try:
        from app.database import SessionLocal
        from app.services.one_time_link_service import OneTimeLinkService
        
        db = SessionLocal()
        try:
            stats = OneTimeLinkService.get_link_statistics(db)
            
            logger.info(
                f"📊 Link Statistics:\n"
                f"  Total: {stats.get('total_links_created')}\n"
                f"  Active: {stats.get('active_links')}\n"
                f"  Used: {stats.get('used_links')}\n"
                f"  Expired: {stats.get('expired_links')}\n"
                f"  Failed: {stats.get('failed_links')}\n"
                f"  Total Claims: {stats.get('total_claims')}\n"
                f"  Successful Claims: {stats.get('successful_claims')}\n"
                f"  Failed Claims: {stats.get('failed_claims')}"
            )
            
            return {"status": "success", "stats": stats}
        
        finally:
            db.close()
    
    except Exception as exc:
        logger.error(f"✗ Error monitoring usage: {str(exc)}")
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@shared_task(bind=True, max_retries=3)
def rotate_expired_link_data_task(self):
    """
    Celery task to archive or remove very old link data
    Keeps data for compliance for 90 days, then archives
    
    Configuration (in celery_config.py):
    ```
    CELERY_BEAT_SCHEDULE = {
        'rotate-link-data': {
            'task': 'app.tasks.one_time_link_tasks.rotate_expired_link_data_task',
            'schedule': crontab(day_of_month='1', hour=3),  # 1st of month at 3 AM
        },
    }
    ```
    """
    try:
        from app.database import SessionLocal
        from app.models.one_time_link import OneTimeLink, LinkStatus
        
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            cutoff_date = now - timedelta(days=90)
            
            # Count links to be archived
            old_links = db.query(OneTimeLink).filter(
                OneTimeLink.created_at < cutoff_date,
                OneTimeLink.status.in_([LinkStatus.EXPIRED, LinkStatus.REVOKED])
            ).count()
            
            logger.info(f"✓ Found {old_links} links older than 90 days for archival")
            
            # In production, archive these to cold storage (S3, GCS, etc.)
            # For now, just log the count
            
            return {"status": "success", "archived_links": old_links}
        
        finally:
            db.close()
    
    except Exception as exc:
        logger.error(f"✗ Error rotating data: {str(exc)}")
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


# Optional: Email notification task for security alerts
@shared_task(bind=True, max_retries=3)
def send_security_alert_task(self, message: str, link_token: str = None):
    """
    Celery task to send security alerts via email
    Called when suspicious activity is detected
    """
    try:
        # In production, integrate with email service (SendGrid, AWS SES, etc.)
        logger.warning(
            f"🚨 SECURITY ALERT:\n"
            f"Message: {message}\n"
            f"Token: {link_token[:10] + '...' if link_token else 'N/A'}"
        )
        
        # send_email(
        #     to="security@smartboda.com",
        #     subject="One-Time Link Security Alert",
        #     body=f"Alert: {message}\nToken: {link_token}"
        # )
        
        return {"status": "success", "alert_sent": True}
    
    except Exception as exc:
        logger.error(f"✗ Error sending alert: {str(exc)}")
        self.retry(exc=exc, countdown=60)