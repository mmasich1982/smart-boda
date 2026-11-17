# backend/app/seed/seed_subscription_plans.py
# ============================================================================
# SEED SCRIPT: Initialize subscription plans
# ✅ Creates 4 plans: Weekly (125), 2-Week (250), 3-Week (375), Monthly (500)
# ✅ REMOVED: Free trial (no longer supported)
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
        # Create Weekly Plan
        # ====================================================================
        weekly_plan = SubscriptionPlan(
            name="Smart Boda Weekly",
            daily_price=Decimal("17.86"),  # 125 / 7
            trial_days=0,
            tier_name="weekly",
            tier_label="Weekly Plan",
            tier_description="125 KES for 1 week of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(weekly_plan)
        print("✅ Created Weekly Plan: 125 KES / 7 days (17.86 KES/day)")

        # ====================================================================
        # Create 2-Week Plan
        # ====================================================================
        two_week_plan = SubscriptionPlan(
            name="Smart Boda 2-Week",
            daily_price=Decimal("17.86"),  # 250 / 14
            trial_days=0,
            tier_name="two_weeks",
            tier_label="2-Week Plan",
            tier_description="250 KES for 2 weeks of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(two_week_plan)
        print("✅ Created 2-Week Plan: 250 KES / 14 days (17.86 KES/day)")

        # ====================================================================
        # Create 3-Week Plan
        # ====================================================================
        three_week_plan = SubscriptionPlan(
            name="Smart Boda 3-Week",
            daily_price=Decimal("17.86"),  # 375 / 21
            trial_days=0,
            tier_name="three_weeks",
            tier_label="3-Week Plan",
            tier_description="375 KES for 3 weeks of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(three_week_plan)
        print("✅ Created 3-Week Plan: 375 KES / 21 days (17.86 KES/day)")

        # ====================================================================
        # Create Monthly Plan
        # ====================================================================
        monthly_plan = SubscriptionPlan(
            name="Smart Boda Monthly",
            daily_price=Decimal("16.67"),  # 500 / 30
            trial_days=0,
            tier_name="monthly",
            tier_label="Monthly Plan",
            tier_description="500 KES for 1 month of unlimited access",
            version=1,
            last_modified_at=datetime.now(timezone.utc),
            modified_by_admin="system@smartboda.com",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )

        session.add(monthly_plan)
        print("✅ Created Monthly Plan: 500 KES / 30 days (16.67 KES/day)")

        # Commit new plans
        session.commit()

        print("\n📊 Subscription Plans Summary:")
        print("=" * 50)
        print(f"Total plans created: 4")
        print(f"- Weekly:    125 KES (17.86 KES/day)")
        print(f"- 2-Week:    250 KES (17.86 KES/day)")
        print(f"- 3-Week:    375 KES (17.86 KES/day)")
        print(f"- Monthly:   500 KES (16.67 KES/day)")
        print("=" * 50)

        print("\n✅ Seed completed successfully!")
        print("\nNotes:")
        print("1. ✅ FREE TRIAL REMOVED - No trial period")
        print("2. Riders must pay immediately to use the app")
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
        weekly = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "weekly"
        ).first()

        two_weeks = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "two_weeks"
        ).first()

        three_weeks = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "three_weeks"
        ).first()

        monthly = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == "monthly"
        ).first()

        print("\n🔍 Verification Results:")
        print("=" * 50)

        if weekly:
            print(f"✅ Weekly Plan:")
            print(f"   - Name: {weekly.name}")
            print(f"   - Daily Price: {weekly.daily_price} KES")
            print(f"   - Trial Days: {weekly.trial_days}")
            print(f"   - Active: {weekly.is_active}")
        else:
            print("❌ Weekly Plan: NOT FOUND")

        if two_weeks:
            print(f"✅ 2-Week Plan:")
            print(f"   - Name: {two_weeks.name}")
            print(f"   - Daily Price: {two_weeks.daily_price} KES")
            print(f"   - Trial Days: {two_weeks.trial_days}")
            print(f"   - Active: {two_weeks.is_active}")
        else:
            print("❌ 2-Week Plan: NOT FOUND")

        if three_weeks:
            print(f"✅ 3-Week Plan:")
            print(f"   - Name: {three_weeks.name}")
            print(f"   - Daily Price: {three_weeks.daily_price} KES")
            print(f"   - Trial Days: {three_weeks.trial_days}")
            print(f"   - Active: {three_weeks.is_active}")
        else:
            print("❌ 3-Week Plan: NOT FOUND")

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
        return weekly and two_weeks and three_weeks and monthly

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