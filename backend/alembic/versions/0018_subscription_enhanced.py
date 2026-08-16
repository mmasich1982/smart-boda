"""0018_subscription_enhanced - Extend subscription tables with audit, pricing, and trial features

Revision ID: 0018_subscription_enhanced
Revises: 0017_revenue_targets
Create Date: 2026-08-15 14:00:00.000000

This migration:
1. ALTERS subscription_plan to add multi-plan support and audit fields
   - Adds: tier_name, tier_label, tier_description (for plan tiers)
   - Adds: version, is_active, last_modified_at, modified_by_admin, created_at (for audit)

2. ALTERS rider_subscription to add financial tracking and audit fields
   - Adds: plan_id FK, total_paid_lifetime, last_payment_at, last_payment_amount (financial tracking)
   - Adds: price_change_viewed_at, created_at, updated_at (audit)

3. CREATES 4 NEW TABLES (no duplication, genuine enhancements):
   - pricing_change_log: Audit trail for price changes with scheduling support
   - pending_price_change: Current pending price changes (one per plan)
   - subscription_trial: Trial period tracking with conversion metrics
   - account_lock_history: Lock/unlock audit trail (automatic and manual)

4. Adds all necessary indices for performance optimization

This approach:
✓ Does NOT conflict with migration 0013
✓ ALTERS existing tables to add enhancements
✓ CREATES only genuinely new tables
✓ Maintains full backward compatibility
✓ Provides complete audit trails
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0018_subscription_enhanced'
down_revision = '0017_revenue_targets'
branch_labels = None
depends_on = None


def upgrade():
    """Upgrade: Enhance subscription tables with new columns and create new tables"""
    
    # ========================================================================
    # STEP 1: ALTER subscription_plan table (add enhancements, don't recreate)
    # ========================================================================
    # Add multi-plan support columns
    op.add_column('subscription_plan', sa.Column('tier_name', sa.String(50), nullable=True))
    op.add_column('subscription_plan', sa.Column('tier_label', sa.String(100), nullable=True))
    op.add_column('subscription_plan', sa.Column('tier_description', sa.Text(), nullable=True))
    
    # Add audit and versioning columns
    op.add_column('subscription_plan', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('subscription_plan', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('subscription_plan', sa.Column('last_modified_at', sa.DateTime(timezone=True), 
                                                   nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    op.add_column('subscription_plan', sa.Column('modified_by_admin', sa.String(100), nullable=True))
    op.add_column('subscription_plan', sa.Column('created_at', sa.DateTime(timezone=True), 
                                                   nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    
    # Create indices for enhanced subscription_plan
    op.create_index('ix_subscription_plan_is_active', 'subscription_plan', ['is_active'])
    op.create_index('ix_subscription_plan_tier_name', 'subscription_plan', ['tier_name'])
    op.create_index('ix_subscription_plan_version', 'subscription_plan', ['version'])
    
    # ========================================================================
    # STEP 2: ALTER rider_subscription table (add enhancements, don't recreate)
    # ========================================================================
    # Add plan_id foreign key
    op.add_column('rider_subscription', sa.Column('plan_id', sa.Integer(), 
                                                   nullable=True, server_default='1'))
    op.create_foreign_key('fk_rider_subscription_plan_id', 'rider_subscription', 'subscription_plan',
                          ['plan_id'], ['id'], ondelete='SET NULL')
    
    # Add financial tracking columns
    op.add_column('rider_subscription', sa.Column('total_paid_lifetime', sa.Numeric(precision=10, scale=2), 
                                                    nullable=False, server_default='0'))
    op.add_column('rider_subscription', sa.Column('last_payment_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('rider_subscription', sa.Column('last_payment_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    
    # Add pricing change awareness
    op.add_column('rider_subscription', sa.Column('price_change_viewed_at', sa.DateTime(timezone=True), nullable=True))
    
    # Add audit columns
    op.add_column('rider_subscription', sa.Column('created_at', sa.DateTime(timezone=True), 
                                                    nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    op.add_column('rider_subscription', sa.Column('updated_at', sa.DateTime(timezone=True), 
                                                    nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    
    # Create indices for enhanced rider_subscription
    op.create_index('ix_rider_subscription_plan_id', 'rider_subscription', ['plan_id'])
    op.create_index('ix_rider_subscription_total_paid_lifetime', 'rider_subscription', ['total_paid_lifetime'])
    op.create_index('ix_rider_subscription_last_payment_at', 'rider_subscription', ['last_payment_at'])
    op.create_index('ix_rider_subscription_price_change_viewed_at', 'rider_subscription', ['price_change_viewed_at'])
    
    # ========================================================================
    # STEP 3: CREATE pricing_change_log table (NEW - audit trail for price changes)
    # ========================================================================
    op.create_table(
        'pricing_change_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        
        # Version tracking
        sa.Column('version', sa.Integer(), nullable=False),
        
        # Pricing details
        sa.Column('daily_price_old', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('daily_price_new', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('discounts', postgresql.JSON(), nullable=True),
        
        # Timing
        sa.Column('announced_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('effective_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        
        # Cancellation (optional)
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_by_admin', sa.String(100), nullable=True),
        sa.Column('cancellation_reason', sa.String(500), nullable=True),
        
        # Admin tracking
        sa.Column('created_by_admin', sa.String(100), nullable=False),
        sa.Column('creation_ip', sa.String(50), nullable=True),
        
        # Audit timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plan.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indices for pricing_change_log
    op.create_index('ix_pricing_change_log_plan_id', 'pricing_change_log', ['plan_id'])
    op.create_index('ix_pricing_change_log_version', 'pricing_change_log', ['version'])
    op.create_index('ix_pricing_change_log_effective_at', 'pricing_change_log', ['effective_at'])
    op.create_index('ix_pricing_change_log_applied_at', 'pricing_change_log', ['applied_at'])
    op.create_index('ix_pricing_change_log_plan_applied', 'pricing_change_log', ['plan_id', 'applied_at'])
    op.create_index('ix_pricing_change_log_is_pending', 'pricing_change_log', ['applied_at', 'cancelled_at'])
    
    # ========================================================================
    # STEP 4: CREATE pending_price_change table (NEW - transient pending changes)
    # ========================================================================
    op.create_table(
        'pending_price_change',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False, unique=True),
        
        # Pricing change details
        sa.Column('daily_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('discounts', postgresql.JSON(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False),
        
        # Timing
        sa.Column('announced_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('effective_at', sa.DateTime(timezone=True), nullable=False),
        
        # Audit
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plan.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indices for pending_price_change
    op.create_index('ix_pending_price_change_plan_id', 'pending_price_change', ['plan_id'], unique=True)
    op.create_index('ix_pending_price_change_effective_at', 'pending_price_change', ['effective_at'])
    
    # ========================================================================
    # STEP 5: CREATE subscription_trial table (NEW - trial period tracking)
    # ========================================================================
    op.create_table(
        'subscription_trial',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rider_id', postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('converted_to_paid', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True),
        
        # Notification tracking
        sa.Column('notification_sent_at', sa.DateTime(timezone=True), nullable=True),
        
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.ForeignKeyConstraint(['rider_id'], ['rider.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indices for subscription_trial
    op.create_index('ix_subscription_trial_rider_id', 'subscription_trial', ['rider_id'], unique=True)
    op.create_index('ix_subscription_trial_converted_to_paid', 'subscription_trial', ['converted_to_paid'])
    op.create_index('ix_subscription_trial_started_at', 'subscription_trial', ['started_at'])
    op.create_index('ix_subscription_trial_converted_at', 'subscription_trial', ['converted_at'])
    
    # ========================================================================
    # STEP 6: CREATE account_lock_history table (NEW - lock/unlock audit trail)
    # ========================================================================
    op.create_table(
        'account_lock_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rider_id', postgresql.UUID(as_uuid=True), nullable=False),
        
        # Action type
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('reason', sa.String(255), nullable=True),
        
        # Trigger
        sa.Column('triggered_by', sa.String(50), nullable=False),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # For manual actions
        sa.Column('admin_email', sa.String(100), nullable=True),
        sa.Column('admin_note', sa.String(500), nullable=True),
        
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.ForeignKeyConstraint(['rider_id'], ['rider.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indices for account_lock_history
    op.create_index('ix_account_lock_history_rider_id', 'account_lock_history', ['rider_id'])
    op.create_index('ix_account_lock_history_action', 'account_lock_history', ['action'])
    op.create_index('ix_account_lock_history_triggered_at', 'account_lock_history', ['triggered_at'])
    op.create_index('ix_account_lock_history_rider_action', 'account_lock_history', ['rider_id', 'action'])
    op.create_index('ix_account_lock_history_triggered_by', 'account_lock_history', ['triggered_by'])


def downgrade():
    """Downgrade: Reverse all enhancements
    
    Drops 4 new tables:
    - account_lock_history
    - subscription_trial
    - pending_price_change
    - pricing_change_log
    
    Removes added columns from:
    - rider_subscription
    - subscription_plan
    """
    
    # Drop new tables in reverse order (respecting foreign keys)
    op.drop_table('account_lock_history')
    op.drop_table('subscription_trial')
    op.drop_table('pending_price_change')
    op.drop_table('pricing_change_log')
    
    # Drop columns from rider_subscription
    op.drop_column('rider_subscription', 'updated_at')
    op.drop_column('rider_subscription', 'created_at')
    op.drop_column('rider_subscription', 'price_change_viewed_at')
    op.drop_column('rider_subscription', 'last_payment_amount')
    op.drop_column('rider_subscription', 'last_payment_at')
    op.drop_column('rider_subscription', 'total_paid_lifetime')
    op.drop_constraint('fk_rider_subscription_plan_id', 'rider_subscription', type_='foreignkey')
    op.drop_column('rider_subscription', 'plan_id')
    
    # Drop columns from subscription_plan
    op.drop_column('subscription_plan', 'created_at')
    op.drop_column('subscription_plan', 'modified_by_admin')
    op.drop_column('subscription_plan', 'last_modified_at')
    op.drop_column('subscription_plan', 'is_active')
    op.drop_column('subscription_plan', 'version')
    op.drop_column('subscription_plan', 'tier_description')
    op.drop_column('subscription_plan', 'tier_label')
    op.drop_column('subscription_plan', 'tier_name')