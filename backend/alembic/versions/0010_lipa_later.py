# alembic/versions/0011_lipa_later.py
# New "Lipa Later" payment method: consolidated M-Pesa channel + deferred-payment tracking.
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_lipa_later"
down_revision = "0009_savings_lifetime_total"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lipa_later_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trip.id"), nullable=False),
        sa.Column("customer_name", sa.String(80), nullable=False),
        sa.Column("customer_mobile", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("trip_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(10), server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("lipa_later_record")
