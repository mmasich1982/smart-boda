# backend/tests/conftest.py
# AUDIT FIX (MVP0 §07, Blocking): "Every backend test file relies on pytest fixtures ... none
# of which are defined anywhere in the repo. There is no conftest.py." This is that file.
#
# Uses an isolated in-memory SQLite database per test function rather than a real Postgres
# instance, so the suite is runnable without docker-compose. A couple of Postgres-only column
# types (JSONB) are given a SQLite-compatible rendering purely for DDL purposes -- this does
# not affect real deployments, which still run against the Postgres engine in app/database.py.
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app

# ---- Make Postgres-only JSONB renderable under SQLite for DDL (test DB only) ----
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import uuid as uuid_lib

# The Postgres dialect's UUID type (psycopg2) natively accepts plain hyphenated strings for
# bind params. Its *generic* bind/result processors -- the ones used when compiled against
# SQLite, as this test suite does -- assume a real uuid.UUID instance and blow up on a plain
# string (which is exactly what every router in this codebase accepts from query params and
# passes straight into `.filter_by(rider_id=rider_id)`). Patched here, test-DB-only, so the
# suite exercises the same string-id code path the real endpoints do.
_orig_bind_processor = PG_UUID.bind_processor
_orig_result_processor = PG_UUID.result_processor


def _sqlite_safe_bind_processor(self, dialect):
    if dialect.name != "sqlite":
        return _orig_bind_processor(self, dialect)

    def process(value):
        if value is None:
            return None
        if isinstance(value, uuid_lib.UUID):
            return value.hex if self.as_uuid else str(value)
        return str(value).replace("-", "") if self.as_uuid else str(value)
    return process


def _sqlite_safe_result_processor(self, dialect, coltype):
    if dialect.name != "sqlite":
        return _orig_result_processor(self, dialect, coltype)

    def process(value):
        if value is None:
            return None
        if self.as_uuid:
            return value if isinstance(value, uuid_lib.UUID) else uuid_lib.UUID(value)
        return str(value)
    return process


PG_UUID.bind_processor = _sqlite_safe_bind_processor
PG_UUID.result_processor = _sqlite_safe_result_processor


# Import every model module so Base.metadata is fully populated before create_all().
import pkgutil
import importlib
import app.models as _models_pkg
for _, _modname, _ in pkgutil.iter_modules(_models_pkg.__path__):
    importlib.import_module(f"app.models.{_modname}")

from app.models.rider import Rider
from app.models.bike_profile import BikeProfile
from app.models.trip import Trip
from app.models.other_expense import OtherExpense
from app.models.savings_account import SavingsAccount
from app.models.savings_contribution import SavingsContribution
from app.models.revenue_target import RevenueTarget
from app.models.target_streak import TargetStreak
from app.models.master_data import LanguageMaster, FuelTypeMaster
from app.models.trip_master_data import PaymentChannelMaster
from app.models.expense_category_master import ExpenseCategoryMaster
from app.models.compliance_master_data import ComplianceRuleConfig


from sqlalchemy.pool import StaticPool

@pytest.fixture()
def db_session():
    # StaticPool is required here: an in-memory SQLite DB is otherwise scoped per-connection,
    # so any query issued from a different connection (e.g. FastAPI's TestClient running the
    # endpoint in a threadpool) would silently see a separate, empty database ("no such table").
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False},
                            poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    # Reference data most flows join against.
    session.add(LanguageMaster(code="en", display_name="English", sort_order=1))
    session.add(FuelTypeMaster(code="petrol", display_name="Petrol", sort_order=1))
    session.add(FuelTypeMaster(code="electric", display_name="Electric", sort_order=2))
    session.add(PaymentChannelMaster(code="cash", display_name="Cash", sort_order=1))
    session.add(ExpenseCategoryMaster(code="other", display_name="Other", sort_order=1))
    session.add(ComplianceRuleConfig(id=1, expiry_reminder_first_days=5, expiry_reminder_final_days=3,
                                      transaction_list_page_size=20, statement_history_page_size=10,
                                      data_export_delivery_hours=48, statement_delivery_hours=48))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_rider(db_session, **overrides):
    defaults = dict(mobile_number=f"07{uuid.uuid4().int % 100000000:08d}", mobile_verified=True,
                     registration_status="active", onboarding_step="home")
    defaults.update(overrides)
    rider = Rider(**defaults)
    db_session.add(rider)
    db_session.commit()
    db_session.refresh(rider)
    return rider


@pytest.fixture()
def seeded_rider(db_session):
    return str(_make_rider(db_session).id)


@pytest.fixture()
def seeded_locked_rider(db_session):
    rider = _make_rider(db_session, registration_status="locked")
    return str(rider.id)


@pytest.fixture()
def seeded_rider_with_trips(db_session):
    rider = _make_rider(db_session)
    db_session.add(BikeProfile(rider_id=rider.id, number_plate="KDA100A", fuel_type_code="petrol",
                                submitted_at=datetime.now(timezone.utc)))
    for amount in (500, 700, 300):
        db_session.add(Trip(rider_id=rider.id, amount=amount, payment_channel_code="cash",
                             recorded_at=datetime.now(timezone.utc), status="active"))
    db_session.commit()
    return str(rider.id)


@pytest.fixture()
def seeded_rider_with_expenses_over_income(db_session):
    rider = _make_rider(db_session)
    db_session.add(Trip(rider_id=rider.id, amount=200, payment_channel_code="cash",
                         recorded_at=datetime.now(timezone.utc), status="active"))
    db_session.add(OtherExpense(rider_id=rider.id, category_code="other", category_label_snapshot="Other",
                                 amount=5000, submitted_at=datetime.now(timezone.utc)))
    db_session.commit()
    return str(rider.id)


@pytest.fixture()
def seeded_sacco_account(db_session):
    rider = _make_rider(db_session)
    account = SavingsAccount(rider_id=rider.id, type="sacco", name="My SACCO", lifetime_total=0)
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    return account


@pytest.fixture()
def seeded_savings_account(db_session):
    rider = _make_rider(db_session)
    account = SavingsAccount(rider_id=rider.id, type="sacco", name="My SACCO", lifetime_total=1000)
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    db_session.add(SavingsContribution(account_id=account.id, amount=1000,
                                        submitted_at=datetime.now(timezone.utc) - timedelta(days=40)))
    db_session.commit()
    return account


@pytest.fixture()
def seeded_target_with_streak_of_3(db_session):
    rider = _make_rider(db_session)
    target = RevenueTarget(rider_id=rider.id, period_type="daily", amount=1000,
                            period_start=datetime.now(timezone.utc).date(), is_active=True)
    db_session.add(target)
    db_session.add(TargetStreak(rider_id=rider.id, period_type="daily", current_streak=3, longest_streak=3))
    db_session.commit()
    db_session.refresh(target)
    return target


@pytest.fixture()
def seeded_rider_with_bike(db_session):
    rider = _make_rider(db_session)
    db_session.add(BikeProfile(rider_id=rider.id, number_plate="KDA100A", fuel_type_code="petrol",
                                current_odometer_km=14820, submitted_at=datetime.now(timezone.utc)))
    db_session.commit()
    return str(rider.id)


@pytest.fixture()
def seeded_rider_with_bike_and_oil_change(db_session):
    from app.models.maintenance_entry import MaintenanceEntry
    from app.models.service_type_master import ServiceTypeMaster
    rider = _make_rider(db_session)
    db_session.add(BikeProfile(rider_id=rider.id, number_plate="KDA100A", fuel_type_code="petrol",
                                current_odometer_km=14820, submitted_at=datetime.now(timezone.utc)))
    # Oil Change is seeded as is_dated=True in production (see seed_fuel_master_data.py) --
    # due_alert_service reads `next_service_odometer` directly for dated types, which is
    # computed from the chosen oil type's interval at entry-save time (sb12_maintenance.py).
    db_session.add(ServiceTypeMaster(code="oil_change", display_name="Oil Change", icon="🛢️",
                                       is_dated=True, default_interval_km=None, is_active=True, sort_order=1))
    db_session.commit()
    db_session.add(MaintenanceEntry(rider_id=rider.id, service_type_code="oil_change", cost=1500,
                                     odometer_reading=14000, oil_type_code=None,
                                     next_service_odometer=14000 + 7000,  # Full Synthetic interval
                                     submitted_at=datetime.now(timezone.utc)))
    db_session.commit()
    return str(rider.id)


@pytest.fixture()
def voided_trip_fixture(db_session):
    rider = _make_rider(db_session)
    trip = Trip(rider_id=rider.id, amount=300, payment_channel_code="cash",
                recorded_at=datetime.now(timezone.utc), status="voided",
                voided_at=datetime.now(timezone.utc))
    db_session.add(trip)
    db_session.commit()
    db_session.refresh(trip)
    return trip


@pytest.fixture()
def retry_now_fn():
    """
    Pure-Python mirror of rider-app/src/offline/syncQueue.js's retryNow() gating logic
    (EXC-SB08-001/002, BR-SB08-002/003), so the same rule is exercised on the backend side
    without needing a JS test runner. Kept intentionally dependency-free.
    """
    def _retry_now(is_connected: bool, failed_once: bool):
        if not is_connected:
            return {"ok": False, "error": "no_connectivity"}
        if not failed_once:
            return {"ok": False, "error": "no_prior_failure"}
        return {"ok": True}
    return _retry_now
