"""Add is_default field to fuel_type_master

Revision ID: 0015_add_is_default_to_fuel_types
Revises: 0014_add_sample_weekly_costs_ksh
Create Date: 2026-07-30 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0015_add_is_default_to_fuel_types'
down_revision = '0014_add_sample_weekly_costs_ksh'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the is_default column to fuel_type_master table
    op.add_column(
        'fuel_type_master',
        sa.Column('is_default', sa.Boolean, nullable=False, server_default='false')
    )
    
    # Mark Petrol and Electric as default fuel types
    op.execute("UPDATE fuel_type_master SET is_default = true WHERE code IN ('Petrol', 'Electric')")


def downgrade() -> None:
    # Remove the column if rolling back
    op.drop_column('fuel_type_master', 'is_default')
