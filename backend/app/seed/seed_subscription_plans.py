# backend/app/seed/seed_subscription_plans.py
# ============================================================================
# SEED SCRIPT: Initialize subscription plans
# ✅ Creates 2 plans: Bi-Weekly (500 KES) and Monthly (1000 KES)
# Run after database migration: python -m app.seed.seed_subscription_plans
# ============================================================================

import os
import sys
from datetime import datetime, timezone
from decimal import Decimal

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    SubscriptionTrial,
)
from uuid import uuid4


def get_db_url():
    """Get database URL from environment"""
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'smart_boda')

    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


def seed_subscription_plans():
    """Create initial subscription plans"""

    # Create database connection
    database_url = get_db_url()

    try:
        engine = create_engine(database_url)
        Session = sessionmaker(bind=engine)
        session = Session()

        print("🌱 Starting subscription plans seed...")

        # Check if plans already exist
        existing_plans = session.query(SubscriptionPlan).count()

        if existing_plans > 0:
            print(f"✅ Plans already exist ({existing_plans} found). Skipping seed.")
            session.close()
            return

        # ====================================================================
        # Create Bi-Weekly Plan
        # ====================================================================
        biweekly_plan = SubscriptionPlan(
            name="Smart Boda Bi-Weekly",
            daily_price=Decimal("35.71"),  # 500 / 14
            trial_days=1,
            tier_name="biweekly",
            tier_label="Bi-Weekly Plan",
            tier_description="500 KES for 2 weeks of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(biweekly_plan)
        print("✅ Created Bi-Weekly Plan: 500 KES / 14 days (35.71 KES/day)")

        # ====================================================================
        # Create Monthly Plan
        # ====================================================================
        monthly_plan = SubscriptionPlan(
            name="Smart Boda Monthly",
            daily_price=Decimal("33.33"),  # 1000 / 30
            trial_days=1,
            tier_name="monthly",
            tier_label="Monthly Plan",
            tier_description="1000 KES for 1 month of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(monthly_plan)
        print("✅ Created Monthly Plan: 1000 KES / 30 days (33.33 KES/day)")

        # Commit new plans
        session.commit()

        print("\n📊 Subscription Plans Summary:")
        print("=" * 50)
        print(f"Total plans created: 2")
        print(f"- Bi-Weekly: 500 KES (35.71 KES/day)")
        print(f"- Monthly:  1000 KES (33.33 KES/day)")
        print("=" * 50)

        print("\n✅ Seed completed successfully!")
        print("\nNext steps:")
        print("1. Riders will auto-get 1-day free trial")
        print("2. They can choose biweekly or monthly plan")
        print("3. Payments will be recorded and verified by admin")

        session.close()

    except Exception as e:
        print(f"\n❌ Seed failed: {str(e)}")
        print("\nTroubleshooting:")
        print("- Check database connection")
        print("- Verify migration has run: alembic upgrade head")
        print("- Check database credentials")
        sys.exit(1)


def verify_seed():
    """Verify seed data was created correctly"""

    database_url = get_db_url()
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        biweekly = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "biweekly"
        ).first()

        monthly = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "monthly"
        ).first()

        print("\n🔍 Verification Results:")
        print("=" * 50)

        if biweekly:
            print(f"✅ Bi-Weekly Plan:")
            print(f"   - Name: {biweekly.name}")
            print(f"   - Daily Price: {biweekly.daily_price} KES")
            print(f"   - Trial Days: {biweekly.trial_days}")
            print(f"   - Active: {biweekly.is_active}")
        else:
            print("❌ Bi-Weekly Plan: NOT FOUND")

        if monthly:
            print(f"✅ Monthly Plan:")
            print(f"   - Name: {monthly.name}")
            print(f"   - Daily Price: {monthly.daily_price} KES")
            print(f"   - Trial Days: {monthly.trial_days}")
            print(f"   - Active: {monthly.is_active}")
        else:
            print("❌ Monthly Plan: NOT FOUND")

        print("=" * 50)

        session.close()
        return biweekly and monthly

    except Exception as e:
        print(f"\n❌ Verification failed: {str(e)}")
        session.close()
        return False


if __name__ == "__main__":
    """
    Run seed script
    Usage: python -m app.seed.seed_subscription_plans
    """

    print("\n" + "=" * 50)
    print("SMART BODA SUBSCRIPTION PLANS SEED")
    print("=" * 50 + "\n")

    # Run seed
    seed_subscription_plans()

    # Verify
    if verify_seed():
        print("\n✅ All checks passed! Your subscription system is ready.")
        sys.exit(0)
    else:
        print("\n❌ Verification failed. Check the output above.")
        sys.exit(1)
