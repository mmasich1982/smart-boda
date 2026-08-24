# alembic/versions/0009_savings_lifetime_total.py
# AUDIT FIX (found while wiring conftest.py fixtures): sb16_savings_tracker.py's own report
# endpoint computes "lifetime_total" by summing contributions on every request rather than
# storing it, and nothing incremented a stored value -- fine for reporting, but there was no
# single source of truth a service layer could update atomically. Stored explicitly now.
from alembic import op
import sqlalchemy as sa

revision = "0009_savings_lifetime_total"
down_revision = "0008_admin_auth_and_export_security"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("savings_account", sa.Column("lifetime_total", sa.Numeric(10, 2), server_default="0"))


def downgrade():
    op.drop_column("savings_account", "lifetime_total")
