"""Add Financial History and Statements tables

Revision ID: 002_add_financial_statements
Revises: 001_initial_schema
Create Date: 2024-01-20 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_financial_statements'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create statements table
    op.create_table(
        'statements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rider_id', sa.String(length=50), nullable=False),
        sa.Column('period_start', sa.DateTime(), nullable=False),
        sa.Column('period_end', sa.DateTime(), nullable=False),
        sa.Column('purpose', sa.String(length=255), nullable=True),
        sa.Column('income', sa.Float(), server_default='0', nullable=False),
        sa.Column('total_expense', sa.Float(), server_default='0', nullable=False),
        sa.Column('net_profit', sa.Float(), server_default='0', nullable=False),
        sa.Column('verification_ref', sa.String(length=50), nullable=True),
        sa.Column('verified', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), 
                  onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('verification_ref', name='uq_statement_verification_ref')
    )

    # Create indexes for statements table
    op.create_index(
        'ix_statement_rider_id',
        'statements',
        ['rider_id'],
        unique=False
    )
    op.create_index(
        'ix_statement_period_start',
        'statements',
        ['period_start'],
        unique=False
    )
    op.create_index(
        'ix_statement_created_at',
        'statements',
        ['created_at'],
        unique=False
    )
    op.create_index(
        'ix_statement_verified',
        'statements',
        ['verified'],
        unique=False
    )

    # Create detailed_statement_requests table
    op.create_table(
        'detailed_statement_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rider_id', sa.String(length=50), nullable=False),
        sa.Column('statement_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('sla_hours', sa.Integer(), server_default='24', nullable=False),
        sa.Column('status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(),
                  onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['statement_id'], ['statements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for detailed_statement_requests table
    op.create_index(
        'ix_detailed_request_rider_id',
        'detailed_statement_requests',
        ['rider_id'],
        unique=False
    )
    op.create_index(
        'ix_detailed_request_statement_id',
        'detailed_statement_requests',
        ['statement_id'],
        unique=False
    )
    op.create_index(
        'ix_detailed_request_status',
        'detailed_statement_requests',
        ['status'],
        unique=False
    )
    op.create_index(
        'ix_detailed_request_requested_at',
        'detailed_statement_requests',
        ['requested_at'],
        unique=False
    )
    op.create_index(
        'ix_detailed_request_email',
        'detailed_statement_requests',
        ['email'],
        unique=False
    )


def downgrade() -> None:
    # Drop detailed_statement_requests table and indexes
    op.drop_index('ix_detailed_request_email', table_name='detailed_statement_requests')
    op.drop_index('ix_detailed_request_requested_at', table_name='detailed_statement_requests')
    op.drop_index('ix_detailed_request_status', table_name='detailed_statement_requests')
    op.drop_index('ix_detailed_request_statement_id', table_name='detailed_statement_requests')
    op.drop_index('ix_detailed_request_rider_id', table_name='detailed_statement_requests')
    op.drop_table('detailed_statement_requests')

    # Drop statements table and indexes
    op.drop_index('ix_statement_verified', table_name='statements')
    op.drop_index('ix_statement_created_at', table_name='statements')
    op.drop_index('ix_statement_period_start', table_name='statements')
    op.drop_index('ix_statement_rider_id', table_name='statements')
    op.drop_table('statements')
