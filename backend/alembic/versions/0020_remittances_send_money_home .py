"""Add remittances and saved_recipients tables for Send Money Home feature

Revision ID: 0020
Revises: 0019
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0020'
down_revision = '0019'
branch_labels = None
depends_on = None


def upgrade():
    # Create saved_recipients table
    op.create_table(
        'saved_recipients',
        sa.Column('id', sa.String(50), nullable=False),
        sa.Column('rider_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_saved_recipients_rider_id', 'saved_recipients', ['rider_id'])
    op.create_index('ix_saved_recipients_name', 'saved_recipients', ['name'])
    op.create_index('ix_saved_recipients_rider_name', 'saved_recipients', ['rider_id', 'name'], unique=True)

    # Create remittances table
    op.create_table(
        'remittances',
        sa.Column('id', sa.String(50), nullable=False),
        sa.Column('rider_id', sa.String(50), nullable=False),
        sa.Column('recipient', sa.String(120), nullable=False),
        sa.Column('relationship', sa.String(50), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('channel', sa.String(50), nullable=False),
        sa.Column('ts', sa.DateTime(), nullable=False),
        sa.Column('sync_status', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rider_id'], ['riders.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_remittances_rider_id', 'remittances', ['rider_id'])
    op.create_index('ix_remittances_ts', 'remittances', ['ts'])
    op.create_index('ix_remittances_recipient', 'remittances', ['recipient'])


def downgrade():
    op.drop_index('ix_remittances_recipient', table_name='remittances')
    op.drop_index('ix_remittances_ts', table_name='remittances')
    op.drop_index('ix_remittances_rider_id', table_name='remittances')
    op.drop_table('remittances')
    
    op.drop_index('ix_saved_recipients_rider_name', table_name='saved_recipients')
    op.drop_index('ix_saved_recipients_name', table_name='saved_recipients')
    op.drop_index('ix_saved_recipients_rider_id', table_name='saved_recipients')
    op.drop_table('saved_recipients')
