# backend/app/seed/seed_admin_users.py
# Creates the first super_admin so the console isn't locked out on a fresh install.
#
# Environment variables (set in the Render dashboard -> Environment):
#   SEED_SUPER_ADMIN_EMAIL       default: hellen@gmail.com
#   SEED_SUPER_ADMIN_PASSWORD    default: hellen123   (change it -- this is only a seed default)
#   SEED_FORCE_PASSWORD_RESET    set to "true" for ONE deploy to overwrite the stored password
#                                of that admin (and re-activate it). Remove it afterwards,
#                                otherwise the password is reset on every restart.
#
# Why the reset flag exists: the seed only ever INSERTS. If the admin row already exists with a
# different password (created earlier with other credentials), the seed skips it, the login form
# returns "Invalid email or password", and there is no shell on Render's free plan to fix it.
import os
from sqlalchemy import func
from app.database import SessionLocal
from app.models.admin_user import AdminUser
from app.auth import hash_password


def run():
    db = SessionLocal()
    try:
        email = os.getenv("SEED_SUPER_ADMIN_EMAIL", "hellen@gmail.com").strip().lower()
        password = os.getenv("SEED_SUPER_ADMIN_PASSWORD", "hellen123")
        force_reset = os.getenv("SEED_FORCE_PASSWORD_RESET", "").strip().lower() in ("1", "true", "yes")

        # Case-insensitive lookup, matching what the login endpoint does.
        existing = db.query(AdminUser).filter(func.lower(AdminUser.email) == email).first()

        if not existing:
            db.add(AdminUser(
                email=email,
                name="Super Admin",
                password_hash=hash_password(password),
                role="super_admin",
                is_active=True,
            ))
            db.commit()
            print(f"Seeded super_admin: {email} / (password from SEED_SUPER_ADMIN_PASSWORD)")
        elif force_reset:
            existing.password_hash = hash_password(password)
            existing.is_active = True
            existing.role = "super_admin"
            db.commit()
            print(f"Reset password for super_admin: {existing.email} "
                  f"(SEED_FORCE_PASSWORD_RESET is on - remove it after logging in)")
        else:
            print(f"Super admin already seeded ({existing.email}), skipping.")
    finally:
        db.close()


if __name__ == "__main__":
    run()