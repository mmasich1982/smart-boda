# backend/alembic/versions/0018_fuel_and_maintenance.py
# UPDATED: Add fuel_entries and maintenance_entries tables for RA-05 and RA-06

from alembic import op
import sqlalchemy as sa


revision = '0018'
down_revision = '0017_revenue_targets'
branch_labels = None
depends_on = None


def upgrade():
    """Create fuel_entries and maintenance_entries tables."""
    
    # Create fuel_entries table
    op.create_table(
        'fuel_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rider_id', sa.Integer(), nullable=False),
        sa.Column('bike_id', sa.Integer(), nullable=False),
        sa.Column('mode', sa.String(20), nullable=False),
        sa.Column('cost_ksh', sa.Float(), nullable=True),
        sa.Column('litres', sa.Float(), nullable=True),
        sa.Column('cost_per_litre', sa.Float(), nullable=True),
        sa.Column('network', sa.String(100), nullable=True),
        sa.Column('odometer_km', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sync_status', sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.ForeignKeyConstraint(['bike_id'], ['bikes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fuel_entries_id'), 'fuel_entries', ['id'], unique=False)
    op.create_index(op.f('ix_fuel_entries_rider_id'), 'fuel_entries', ['rider_id'], unique=False)
    op.create_index(op.f('ix_fuel_entries_bike_id'), 'fuel_entries', ['bike_id'], unique=False)
    op.create_index(op.f('ix_fuel_entries_created_at'), 'fuel_entries', ['created_at'], unique=False)

    # Create maintenance_entries table
    op.create_table(
        'maintenance_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rider_id', sa.Integer(), nullable=False),
        sa.Column('bike_id', sa.Integer(), nullable=False),
        sa.Column('service_type', sa.String(100), nullable=False),
        sa.Column('cost_ksh', sa.Float(), nullable=False),
        sa.Column('odometer_km', sa.Float(), nullable=False),
        sa.Column('oil_type', sa.String(100), nullable=True),
        sa.Column('next_service_odometer', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sync_status', sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.ForeignKeyConstraint(['bike_id'], ['bikes.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_maintenance_entries_id'), 'maintenance_entries', ['id'], unique=False)
    op.create_index(op.f('ix_maintenance_entries_rider_id'), 'maintenance_entries', ['rider_id'], unique=False)
    op.create_index(op.f('ix_maintenance_entries_bike_id'), 'maintenance_entries', ['bike_id'], unique=False)
    op.create_index(op.f('ix_maintenance_entries_service_type'), 'maintenance_entries', ['service_type'], unique=False)
    op.create_index(op.f('ix_maintenance_entries_created_at'), 'maintenance_entries', ['created_at'], unique=False)


def downgrade():
    """Drop fuel_entries and maintenance_entries tables."""
    
    op.drop_index(op.f('ix_maintenance_entries_created_at'), table_name='maintenance_entries')
    op.drop_index(op.f('ix_maintenance_entries_service_type'), table_name='maintenance_entries')
    op.drop_index(op.f('ix_maintenance_entries_bike_id'), table_name='maintenance_entries')
    op.drop_index(op.f('ix_maintenance_entries_rider_id'), table_name='maintenance_entries')
    op.drop_index(op.f('ix_maintenance_entries_id'), table_name='maintenance_entries')
    op.drop_table('maintenance_entries')
    
    op.drop_index(op.f('ix_fuel_entries_created_at'), table_name='fuel_entries')
    op.drop_index(op.f('ix_fuel_entries_bike_id'), table_name='fuel_entries')
    op.drop_index(op.f('ix_fuel_entries_rider_id'), table_name='fuel_entries')
    op.drop_index(op.f('ix_fuel_entries_id'), table_name='fuel_entries')
    op.drop_table('fuel_entries')