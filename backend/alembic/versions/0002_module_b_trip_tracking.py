# alembic/versions/module_b_trip_tracking.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_module_b_trip_tracking"
down_revision = "0001_module_a_onboarding"
branch_labels = None
depends_on = None

def upgrade():
    # ---- Master Data: Payment Channel List (BR-SB05-003) ----
    op.create_table(
        "payment_channel_master",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(20), unique=True, nullable=False),   # Cash, SendMoney, Till, Paybill, Pochi
        sa.Column("display_name", sa.String(40), nullable=False),
        sa.Column("emoji", sa.String(8)),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    # ---- Master Data: Correction Reason List (BR-SB07-012) ----
    op.create_table(
        "correction_reason_master",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(30), unique=True, nullable=False),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    # ---- Trip & Entry Rule Configuration: correction window + OOW SLA (BR-SB07-001/007) ----
    # Single-row key/value style table so Super Admin can change either number without a migration.
    op.create_table(
        "trip_entry_rule_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("config_key", sa.String(60), unique=True, nullable=False),
        sa.Column("config_value", sa.Integer, nullable=False),   # stored as an integer number of hours
        sa.Column("description", sa.String(200)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Trip (BR-SB05-001 through 011, BR-SB06-xxx, BR-SB07-xxx) ----
    op.create_table(
        "trip",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("payment_channel_code", sa.String(20), sa.ForeignKey("payment_channel_master.code"), nullable=False),
        sa.Column("note", sa.String(140)),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),      # BR-SB05-006: submission time, not sync time
        sa.Column("status", sa.String(10), server_default="active"),                          # active | voided
        sa.Column("sync_status", sa.String(20), server_default="pending"),                     # pending | synced
        sa.Column("original_amount", sa.Numeric(10, 2)),                                   # BR-SB07-004: set only on first correction
        sa.Column("original_payment_channel_code", sa.String(20)),
        sa.Column("correction_reason_code", sa.String(30), sa.ForeignKey("correction_reason_master.code")),
        sa.Column("corrected_at", sa.DateTime(timezone=True)),
        sa.Column("voided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_trip_rider_recorded", "trip", ["rider_id", "recorded_at"])

    # ---- Out-of-Window Correction Request (BR-SB07-007) ----
    op.create_table(
        "out_of_window_correction_request",
        sa.Column("id", sa.String(12), primary_key=True),   # e.g. OOW-000045
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trip.id"), nullable=False),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending_review"),   # pending_review | resolved
        sa.Column("reviewed_by_admin_id", sa.String(60)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("resolution_note", sa.String(300)),
    )

def downgrade():
    op.drop_table("out_of_window_correction_request")
    op.drop_table("trip")
    op.drop_table("trip_entry_rule_config")
    op.drop_table("correction_reason_master")
    op.drop_table("payment_channel_master")
