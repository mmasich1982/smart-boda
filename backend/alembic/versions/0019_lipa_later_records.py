"""Migration 0019_lipa_later_records
Replace old lipa_later_record table with new schema for enhanced customer credit tracking

Revision ID: 0019_lipa_later_records
Revises: 0018_subscription_enhanced
Create Date: 2026-08-22 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = '0019_lipa_later_records'
down_revision = '0018_subscription_enhanced'
branch_labels = None
depends_on = None


def upgrade():
    """
    Upgrade: Drop old lipa_later_record table and create new enhanced schema
    with Payment and enhanced Trip/Statement relationships
    """
    
    # --- Drop old table ---
    op.drop_table('lipa_later_record')

    # --- Create new lipa_later_records table ---
    op.create_table(
        'lipa_later_records',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('trip_id', sa.String(), sa.ForeignKey('trips.id'), nullable=False, index=True),
        sa.Column('rider_id', sa.String(), nullable=False, index=True),
        sa.Column('customer_name', sa.String(80), nullable=False),
        sa.Column('customer_mobile', sa.String(20), nullable=False),
        sa.Column('original_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('remaining_amount', sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column('status', sa.String(20), server_default="pending"),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('channel_origin', sa.String(20), server_default="app"),
        sa.Column('sync_status', sa.String(20), server_default="pending"),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now())
    )

    # --- Create indexes for lipa_later_records ---
    op.create_index('idx_lipa_later_records_rider_id', 'lipa_later_records', ['rider_id'])
    op.create_index('idx_lipa_later_records_status', 'lipa_later_records', ['status'])
    op.create_index('idx_lipa_later_records_due_date', 'lipa_later_records', ['due_date'])
    op.create_index('idx_lipa_later_records_sync_status', 'lipa_later_records', ['sync_status'])

    # --- Create payments table ---
    op.create_table(
        'payments',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('lipa_later_record_id', sa.String(), sa.ForeignKey('lipa_later_records.id'), nullable=False, index=True),
        sa.Column('rider_id', sa.String(), nullable=False, index=True),
        sa.Column('amount_paid', sa.Numeric(10, 2), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False, index=True),
        sa.Column('reference', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('sync_status', sa.String(20), server_default="pending"),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False, index=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now())
    )

    # --- Create indexes for payments ---
    op.create_index('idx_payments_record_id', 'payments', ['lipa_later_record_id'])
    op.create_index('idx_payments_rider_id', 'payments', ['rider_id'])
    op.create_index('idx_payments_date', 'payments', ['payment_date'])
    op.create_index('idx_payments_sync_status', 'payments', ['sync_status'])

    # --- Update trips table ---
    op.add_column('trips', sa.Column('payment_status', sa.String(20), server_default='outstanding'))
    op.add_column('trips', sa.Column('payment_method', sa.String(50), server_default='cash'))
    op.add_column('trips', sa.Column('lipa_later_record_id', sa.String(), sa.ForeignKey('lipa_later_records.id')))

    op.create_index('idx_trips_payment_status', 'trips', ['payment_status'])

    # --- Update statements table ---
    op.create_index('idx_statements_entry_type', 'statements', ['entry_type'])
    op.create_index('idx_statements_rider_date', 'statements', ['rider_id', 'entry_date'])


def downgrade():
    """
    Downgrade: Revert to old lipa_later_record table schema
    """
    # Drop new indexes
    op.drop_index('idx_statements_rider_date', table_name='statements')
    op.drop_index('idx_statements_entry_type', table_name='statements')

    op.drop_index('idx_trips_payment_status', table_name='trips')
    op.drop_column('trips', 'payment_status')
    op.drop_column('trips', 'payment_method')
    op.drop_column('trips', 'lipa_later_record_id')

    op.drop_index('idx_payments_sync_status', table_name='payments')
    op.drop_index('idx_payments_date', table_name='payments')
    op.drop_index('idx_payments_rider_id', table_name='payments')
    op.drop_index('idx_payments_record_id', table_name='payments')
    op.drop_table('payments')

    op.drop_index('idx_lipa_later_records_sync_status', table_name='lipa_later_records')
    op.drop_index('idx_lipa_later_records_due_date', table_name='lipa_later_records')
    op.drop_index('idx_lipa_later_records_status', table_name='lipa_later_records')
    op.drop_index('idx_lipa_later_records_rider_id', table_name='lipa_later_records')
    op.drop_table('lipa_later_records')

    # Recreate old table
    op.create_table(
        'lipa_later_record',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('rider_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('rider.id'), nullable=False),
        sa.Column('trip_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('trip.id'), nullable=False),
        sa.Column('customer_name', sa.String(80), nullable=False),
        sa.Column('customer_mobile', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('trip_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(10), server_default="pending"),
        sa.Column('paid_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now())
    )