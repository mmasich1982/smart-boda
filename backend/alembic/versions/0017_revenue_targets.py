"""0017_revenue_targets - Fix revenue targets schema to match model

Revision ID: 0017_revenue_targets
Revises: 0016_other_expenses
Create Date: 2026-08-12 12:00:00.000000

This migration:
1. Drops the incorrectly structured revenue_targets table (if exists)
2. Creates revenue_target table matching the ORM model
3. Adds all necessary timestamp fields
4. Adds useful indices for performance
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0017_revenue_targets'
down_revision = '0016_add_financial_statements'
branch_labels = None
depends_on = None


def upgrade():
    """Upgrade: Create properly structured revenue_target table"""
    
    # Drop old incorrect table if it exists
    op.execute("DROP TABLE IF EXISTS revenue_targets CASCADE")
    
    # Create revenue_target table matching the ORM model exactly
    op.create_table(
        'revenue_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rider_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period', sa.String(20), nullable=False),  # daily | weekly | monthly
        sa.Column('target_amount_ksh', sa.Float(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['rider_id'], ['rider.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rider_id', 'period', 'is_active', name='uq_one_active_target_per_period'),
    )
    
    # Create indices for performance
    op.create_index('ix_revenue_target_rider_id', 'revenue_targets', ['rider_id'])
    op.create_index('ix_revenue_target_is_active', 'revenue_targets', ['is_active'])
    op.create_index('ix_revenue_target_created_at', 'revenue_targets', ['created_at'])
    op.create_index('ix_revenue_target_rider_active', 'revenue_targets', ['rider_id', 'is_active'])
    

def downgrade():
    """Downgrade: Drop revenue_targets table and indices
    
    Note: This migration fixes critical schema errors. If you need to rollback
    completely, use: alembic downgrade 0016_other_expenses
    That will restore the previous state without recreating broken schema.
    """
    
    # Drop indices
    op.drop_index('ix_revenue_targets_rider_active', table_name='revenue_targets')
    op.drop_index('ix_revenue_targets_created_at', table_name='revenue_targets')
    op.drop_index('ix_revenue_targets_is_active', table_name='revenue_targets')
    op.drop_index('ix_revenue_targets_rider_id', table_name='revenue_targets')
    
    # Drop table
    op.drop_table('revenue_targets')
