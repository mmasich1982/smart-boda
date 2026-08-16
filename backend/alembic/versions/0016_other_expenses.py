# backend/alembic/versions/0016_other_expenses.py
# UPDATED: Add other_expenses table for RA-07-C (Other Expense tracking)

from alembic import op
import sqlalchemy as sa


revision = '0016_other_expenses'
down_revision = '0015_add_is_default_to_fuel_types'
branch_labels = None
depends_on = None


def upgrade():
    """Create other_expenses table and add relationship to riders."""
    op.create_table(
        'other_expenses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rider_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(100), nullable=False),
        sa.Column('amount_ksh', sa.Float(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sync_status', sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_other_expenses_id'), 'other_expenses', ['id'], unique=False)
    op.create_index(op.f('ix_other_expenses_rider_id'), 'other_expenses', ['rider_id'], unique=False)
    op.create_index(op.f('ix_other_expenses_category'), 'other_expenses', ['category'], unique=False)
    op.create_index(op.f('ix_other_expenses_created_at'), 'other_expenses', ['created_at'], unique=False)


def downgrade():
    """Drop other_expenses table."""
    op.drop_index(op.f('ix_other_expenses_created_at'), table_name='other_expenses')
    op.drop_index(op.f('ix_other_expenses_category'), table_name='other_expenses')
    op.drop_index(op.f('ix_other_expenses_rider_id'), table_name='other_expenses')
    op.drop_index(op.f('ix_other_expenses_id'), table_name='other_expenses')
    op.drop_table('other_expenses')
