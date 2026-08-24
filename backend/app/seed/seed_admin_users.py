# backend/app/seed/seed_admin_users.py
# Creates the first super_admin so the console isn't locked out on a fresh install. Change
# this password immediately after first login in any real deployment -- it's a seed default.
import os
from app.database import SessionLocal
from app.models.admin_user import AdminUser
from app.auth import hash_password


def run():
    db = SessionLocal()
    default_email = os.getenv("SEED_SUPER_ADMIN_EMAIL", "hellen@gmail.com")
    default_password = os.getenv("SEED_SUPER_ADMIN_PASSWORD", "hellen123")
    existing = db.query(AdminUser).filter_by(email=default_email).first()
    if not existing:
        db.add(AdminUser(email=default_email, name="Super Admin",
                          password_hash=hash_password(default_password), role="super_admin"))
        db.commit()
        print(f"Seeded super_admin: {default_email} / (set via SEED_SUPER_ADMIN_PASSWORD)")
    else:
        print("Super admin already seeded, skipping.")
    db.close()


if __name__ == "__main__":
    run()
