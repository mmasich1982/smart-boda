# backend/alembic/versions/0022_one_time_links.py
"""Add one-time links table

Revision ID: 0022
Revises: 0021
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0022'
down_revision = '0021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create one_time_links table
    op.create_table(
        'one_time_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('rider_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('purpose', sa.String(50), nullable=False, server_default='app_share'),
        sa.Column('status', sa.String(30), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('device_fingerprint', sa.String(255), nullable=True),
        sa.Column('created_from_ip', sa.String(45), nullable=True),
        sa.Column('created_from_user_agent', sa.String(500), nullable=True),
        sa.Column('accessed_from_ip', sa.String(45), nullable=True),
        sa.Column('accessed_from_user_agent', sa.String(500), nullable=True),
        sa.Column('access_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_failed_attempts', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('access_log', postgresql.JSON(), nullable=False, server_default='[]'),
        sa.Column('metadata', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('is_shared', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('share_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('shared_via', sa.String(20), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('ix_one_time_links_token', 'one_time_links', ['token'], unique=True)
    op.create_index('ix_one_time_links_rider_id', 'one_time_links', ['rider_id'])
    op.create_index('ix_one_time_links_status', 'one_time_links', ['status'])
    op.create_index('ix_one_time_links_expires_at', 'one_time_links', ['expires_at'])
    op.create_index('ix_one_time_links_created_at', 'one_time_links', ['created_at'])
    op.create_index('ix_one_time_links_rider_id_status', 'one_time_links', ['rider_id', 'status'])
    op.create_index('ix_one_time_links_token_status', 'one_time_links', ['token', 'status'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_one_time_links_token_status', table_name='one_time_links')
    op.drop_index('ix_one_time_links_rider_id_status', table_name='one_time_links')
    op.drop_index('ix_one_time_links_created_at', table_name='one_time_links')
    op.drop_index('ix_one_time_links_expires_at', table_name='one_time_links')
    op.drop_index('ix_one_time_links_status', table_name='one_time_links')
    op.drop_index('ix_one_time_links_rider_id', table_name='one_time_links')
    op.drop_index('ix_one_time_links_token', table_name='one_time_links')
    
    # Drop table
    op.drop_table('one_time_links')