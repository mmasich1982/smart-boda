"""Payment and Subscription tables migration

Consolidates three model definitions:
- Payment: payment transactions with M-Pesa tracking and reconciliation (split from subscription.py)
- SubscriptionPlan: master plan configuration for subscription offerings (EM-00)
- RiderSubscription: per-rider subscription state and trial tracking

Fixed issues:
- Payment & RiderSubscription: corrected rider_id foreign keys to "rider" (not "riders")
- Payment: separated from subscription.py where it was accidentally concatenated
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0013_payment_subscription"
down_revision = "0012_ui_string_master"


def upgrade():
    # EM-00 Plan Configuration — one active row, Super Admin-managed
    op.create_table(
        "subscription_plan",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, server_default="Boda Daily Plus"),
        sa.Column("daily_price", sa.Numeric, server_default="35"),
        sa.Column("trial_days", sa.Integer, server_default="2"),
    )

    # BR-SB24-009: Rider subscription state and trial tracking
    op.create_table(
        "rider_subscription",
        sa.Column("rider_id", UUID(as_uuid=True), sa.ForeignKey("rider.id"), primary_key=True),
        sa.Column("expiry_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("frequency", sa.String, server_default="daily"),  # daily | weekly | biweekly | monthly
        sa.Column("has_ever_paid", sa.Boolean, server_default="false"),  # False = still on the free trial
        sa.Column("locked", sa.Boolean, server_default="false"),
        sa.Column("lock_reason", sa.String, nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # BR-SB24-009: Payment transactions with M-Pesa tracking and back-office reconciliation
    op.create_table(
        "payment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("amount", sa.Numeric, nullable=False),
        sa.Column("label", sa.String, nullable=False),  # e.g. "Weekly Plan", "7-Day Prepayment"
        sa.Column("channel", sa.String, server_default="Manual (Lipa na M-Pesa / Pochi / Send Money)"),
        sa.Column("mpesa_code", sa.String, nullable=True),  # rider-entered, required at submit
        sa.Column("status", sa.String, server_default="Success"),  # self-declared success is immediate
        sa.Column("reconciliation", sa.String, server_default="Pending Super Admin Review"),  # → "Verified" via back-office
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reconciled_by_admin", sa.String, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("payment")
    op.drop_table("rider_subscription")
    op.drop_table("subscription_plan")
