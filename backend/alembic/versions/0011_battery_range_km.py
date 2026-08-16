# alembic/versions/0012_battery_range_km.py
# AUDIT FIX (found during full-codebase sweep): battery_range_service.py has always read
# bike.battery_range_km as a per-bike override; the column never existed.
from alembic import op
import sqlalchemy as sa

revision = "0011_battery_range_km"
down_revision = "0010_lipa_later"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bike_profile", sa.Column("battery_range_km", sa.Integer, nullable=True))


def downgrade():
    op.drop_column("bike_profile", "battery_range_km")
