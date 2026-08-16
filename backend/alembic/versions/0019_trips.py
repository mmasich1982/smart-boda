# backend/alembic/versions/0019_trips.py
# UPDATED: Add trips table for trip income tracking

from alembic import op
import sqlalchemy as sa


revision = '0019'
down_revision = '0018_fuel_and_maintenance'
branch_labels = None
depends_on = None


def upgrade():
    """Create trips table for income/fare tracking."""
    op.create_table(
        'trips',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rider_id', sa.Integer(), nullable=False),
        sa.Column('amount_ksh', sa.Float(), nullable=False),
        sa.Column('payment_method', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('trip_date', sa.DateTime(), nullable=False),
        sa.Column('lipa_later_due_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sync_status', sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trips_id'), 'trips', ['id'], unique=False)
    op.create_index(op.f('ix_trips_rider_id'), 'trips', ['rider_id'], unique=False)
    op.create_index(op.f('ix_trips_trip_date'), 'trips', ['trip_date'], unique=False)
    op.create_index(op.f('ix_trips_created_at'), 'trips', ['created_at'], unique=False)


def downgrade():
    """Drop trips table."""
    op.drop_index(op.f('ix_trips_created_at'), table_name='trips')
    op.drop_index(op.f('ix_trips_trip_date'), table_name='trips')
    op.drop_index(op.f('ix_trips_rider_id'), table_name='trips')
    op.drop_index(op.f('ix_trips_id'), table_name='trips')
    op.drop_table('trips')