# alembic/versions/module_a_onboarding.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_module_a_onboarding"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # ---- Master Data: Language List (Super Admin governed, BR-SB01-011) ----
    op.create_table(
        "language_master",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(10), unique=True, nullable=False),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Master Data: Bike Fuel Type List (BR-SB02-002) ----
    op.create_table(
        "fuel_type_master",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
        sa.Column("display_name", sa.String(40), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    # ---- Value-preview illustrative example config (BR-SB01-011) ----
    op.create_table(
        "value_preview_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("language_code", sa.String(10), sa.ForeignKey("language_master.code"), nullable=False),
        sa.Column("sample_weekly_earnings_ksh", sa.Numeric(10, 2), nullable=False),
        sa.Column("sample_cost_breakdown_json", postgresql.JSONB, nullable=False),
    )

    # ---- Rider (identity, PIN hash, consent — BR-SB03-007/008, BR-SB04-012) ----
    op.create_table(
        "rider",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("language_code", sa.String(10), sa.ForeignKey("language_master.code")),
        sa.Column("mobile_number", sa.String(15), unique=True, nullable=False),
        sa.Column("mobile_verified", sa.Boolean, server_default="false"),  # set True only by Super Admin manual review, BR-SB03-002
        sa.Column("full_name", sa.String(80)),
        sa.Column("consent_accepted_at", sa.DateTime(timezone=True)),
        sa.Column("consent_content_version", sa.String(20)),
        sa.Column("pin_hash", sa.String(255)),  # bcrypt hash only — BR-SB04-012, never plain text
        sa.Column("pin_attempts_left", sa.Integer, server_default="5"),
        sa.Column("pin_locked_until", sa.DateTime(timezone=True)),
        sa.Column("onboarding_step", sa.String(30), server_default="valuePreview"),
        sa.Column("registration_status", sa.String(20), server_default="pending"),  # pending|verified_incomplete|active
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Bike Profile (BR-SB02-001 through 012) ----
    op.create_table(
        "bike_profile",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("number_plate", sa.String(12), nullable=False),  # auto-uppercased before save, BR-SB02-001
        sa.Column("fuel_type_code", sa.String(20), sa.ForeignKey("fuel_type_master.code"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),  # BR-SB02-011: submission time, not sync time
        sa.Column("sync_status", sa.String(20), server_default="pending_sync"),  # pending_sync|synced|pending_review
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )
    op.create_index("ix_bike_profile_plate", "bike_profile", ["number_plate"])

    # ---- Duplicate-Plate Conflict Case (BR-SB02-006/007/008/009) ----
    op.create_table(
        "duplicate_plate_case",
        sa.Column("id", sa.String(12), primary_key=True),  # e.g. DPC-000123
        sa.Column("number_plate", sa.String(12), nullable=False),
        sa.Column("rider_a_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id")),
        sa.Column("rider_b_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id")),
        sa.Column("status", sa.String(20), server_default="pending_review"),
        sa.Column("resolution_decision", sa.String(30)),  # confirm_a|confirm_b|request_correction_both
        sa.Column("reviewed_by_admin_id", sa.String(60)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- PIN Recovery Request (BR-SB04-007/008) ----
    op.create_table(
        "pin_recovery_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("mobile_number", sa.String(15), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),  # pending|approved
        sa.Column("reviewed_by_admin_id", sa.String(60)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table("pin_recovery_request")
    op.drop_table("duplicate_plate_case")
    op.drop_table("bike_profile")
    op.drop_table("rider")
    op.drop_table("value_preview_config")
    op.drop_table("fuel_type_master")
    op.drop_table("language_master")
