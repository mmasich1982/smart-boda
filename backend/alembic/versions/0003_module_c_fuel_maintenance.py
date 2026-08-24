# backend/alembic/versions/module_c_fuel_maintenance.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_module_c_fuel_maintenance"
down_revision = "0002_module_b_trip_tracking"

def upgrade():
    # ---- Swap Partner Master Data (BR-SB10-002/003) ----
    op.create_table(
        "swap_partner_master",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("standard_fee", sa.Numeric(8, 2)),  # null = "Other/Unlisted", manual entry
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Service Type Master Data (BR-SB12-001) ----
    op.create_table(
        "service_type_master",
        sa.Column("code", sa.String(30), primary_key=True),  # e.g. "oil_change"
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("icon", sa.String(10)),
        sa.Column("is_dated", sa.Boolean, server_default="false"),  # BR-SB12-002: only Oil Change / General Service
        sa.Column("default_interval_km", sa.Integer),  # used when is_dated=false, BR-SB12-007
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Oil Type Master Data (BR-SB12-004) ----
    op.create_table(
        "oil_type_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("interval_km", sa.Integer, nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Trip & Entry Rule Configuration additions (this batch) ----
    op.create_table(
        "fuel_maintenance_rule_config",
        sa.Column("id", sa.Integer, primary_key=True),  # single-row config table
        sa.Column("odometer_prompt_frequency", sa.Integer, server_default="5"),  # BR-SB09-007
        sa.Column("default_battery_range_km", sa.Integer, server_default="60"),
        sa.Column("due_alert_tier_first_km", sa.Integer, server_default="500"),  # BR-SB12-008
        sa.Column("due_alert_tier_firm_km", sa.Integer, server_default="200"),
        sa.Column("due_alert_tier_final_km", sa.Integer, server_default="100"),
    )

    # ---- Fuel / Battery Swap / Charging Entry, one table (BR-SB09/SB10) ----
    op.create_table(
        "fuel_entry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),  # "petrol" | "swap" | "charging"
        sa.Column("litres", sa.Numeric(6, 1)),                # petrol only
        sa.Column("cost", sa.Numeric(8, 2), nullable=False),
        sa.Column("cost_per_litre", sa.Numeric(8, 2)),        # petrol only, BR-SB09-003
        sa.Column("swap_partner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("swap_partner_master.id")),  # swap only
        sa.Column("odometer_reading", sa.Integer),            # swap + charging
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),  # BR-SB09-009/BR-SB10-012
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Odometer Reading History, append-only (BR-SB11-006) ----
    op.create_table(
        "odometer_reading",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("value_km", sa.Integer, nullable=False),
        sa.Column("is_reset_override", sa.Boolean, server_default="false"),  # BR-SB11-012
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Service / Maintenance Entry (BR-SB12) ----
    op.create_table(
        "maintenance_entry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("service_type_code", sa.String(30), sa.ForeignKey("service_type_master.code"), nullable=False),
        sa.Column("cost", sa.Numeric(8, 2), nullable=False),
        sa.Column("odometer_reading", sa.Integer),           # dated types only
        sa.Column("oil_type_code", sa.String(30), sa.ForeignKey("oil_type_master.code")),  # dated types only
        sa.Column("next_service_odometer", sa.Integer),     # dated types only, BR-SB12-005
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Extend bike_profile (Module A) with current odometer + default oil type + fuel-entry counter ----
    op.add_column("bike_profile", sa.Column("current_odometer_km", sa.Integer))
    op.add_column("bike_profile", sa.Column("default_oil_type_code", sa.String(30), sa.ForeignKey("oil_type_master.code")))
    op.add_column("bike_profile", sa.Column("fuel_entry_count_since_odometer_prompt", sa.Integer, server_default="0"))  # BR-SB09-008

def downgrade():
    op.drop_column("bike_profile", "fuel_entry_count_since_odometer_prompt")
    op.drop_column("bike_profile", "default_oil_type_code")
    op.drop_column("bike_profile", "current_odometer_km")
    op.drop_table("maintenance_entry")
    op.drop_table("odometer_reading")
    op.drop_table("fuel_entry")
    op.drop_table("fuel_maintenance_rule_config")
    op.drop_table("oil_type_master")
    op.drop_table("service_type_master")
    op.drop_table("swap_partner_master")
