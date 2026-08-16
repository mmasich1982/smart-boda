"""Add sample_weekly_costs_ksh to value_preview_config

Revision ID: 0014_add_sample_weekly_costs_ksh
Revises: 0013_payment_subscription
Create Date: 2026-07-30 14:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0014_add_sample_weekly_costs_ksh'
down_revision = '0013_payment_subscription'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the new column to value_preview_config table
    op.add_column(
        'value_preview_config',
        sa.Column('sample_weekly_costs_ksh', sa.Numeric(10, 2), nullable=False, server_default='0.00')
    )
    # Remove the server_default after the column is added
    op.alter_column(
        'value_preview_config',
        'sample_weekly_costs_ksh',
        server_default=None
    )


def downgrade() -> None:
    # Remove the column if rolling back
    op.drop_column('value_preview_config', 'sample_weekly_costs_ksh')
