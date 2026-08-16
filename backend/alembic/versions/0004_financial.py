from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_module_d_financial_performance"
down_revision = "0003_module_c_fuel_maintenance"

def upgrade():
    # ---- Expense Category / Goal Type / Family Relationship Master Data (BR-SB13-006/SB17-002) ----
    op.create_table(
        "expense_category_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )
    op.create_table(
        "goal_type_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )
    op.create_table(
        "family_relationship_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Trip & Entry Rule Configuration additions (this batch) ----
    op.create_table(
        "financial_rule_config",
        sa.Column("id", sa.Integer, primary_key=True),  # single-row config table
        sa.Column("target_min_trip_count", sa.Integer, server_default="7"),         # BR-SB15-002
        sa.Column("milestone_thresholds_pct", sa.String(30), server_default="50,75,100"),
    )

    # ---- Other Expense (BR-SB13) ----
    op.create_table(
        "other_expense",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("category_code", sa.String(30), sa.ForeignKey("expense_category_master.code"), nullable=False),
        sa.Column("category_label_snapshot", sa.String(60), nullable=False),  # EXC-SB13-008: survives a later category retirement
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Revenue Target + Streak (BR-SB15) ----
    op.create_table(
        "revenue_target",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("period_type", sa.String(10), nullable=False),  # daily | weekly | monthly, BR-SB15-012
        sa.Column("amount", sa.Numeric(9, 2), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("milestones_shown", sa.String(20), server_default=""),  # comma-list of thresholds already fired, BR-SB15-006
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.UniqueConstraint("rider_id", "period_type", "is_active", name="uq_one_active_target_per_period_type"),
    )
    op.create_table(
        "target_streak",
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), primary_key=True),
        sa.Column("period_type", sa.String(10), primary_key=True),
        sa.Column("current_streak", sa.Integer, server_default="0"),
        sa.Column("longest_streak", sa.Integer, server_default="0"),
        sa.Column("lifetime_targets_achieved", sa.Integer, server_default="0"),  # BR-SB15-010: combined across all 3 period types
    )

    # ---- SACCO/Chama Savings (BR-SB16) ----
    op.create_table(
        "savings_account",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),  # sacco | chama
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("frequency", sa.String(10), server_default="weekly"),  # informational only, BR-SB16-007
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "savings_contribution",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("savings_account.id"), nullable=False),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ---- My Goals (BR-SB17-A/B) ----
    op.create_table(
        "goal",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("goal_type_code", sa.String(30), sa.ForeignKey("goal_type_master.code"), nullable=False),
        sa.Column("name", sa.String(60)),                       # optional, BR-SB17-004
        sa.Column("target_amount", sa.Numeric(9, 2), nullable=False),
        sa.Column("target_date", sa.Date),                     # optional, informational only, EXC-SB17-012
        sa.Column("status", sa.String(20), server_default="active"),  # active | achieved | archived
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "goal_contribution",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goal.id"), nullable=False),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ---- Send Money Home + reusable Saved Recipients (BR-SB17-C) ----
    op.create_table(
        "saved_recipient",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.UniqueConstraint("rider_id", "name", name="uq_saved_recipient_rider_name"),  # EXC-SB17-009: prevents duplicates
    )
    op.create_table(
        "remittance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("recipient_name", sa.String(60), nullable=False),
        sa.Column("relationship_code", sa.String(30), sa.ForeignKey("family_relationship_master.code")),  # optional, BR-SB17-008
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("channel_code", sa.String(30), sa.ForeignKey("payment_channel_master.code"), nullable=False),  # reused from Module B
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )

def downgrade():
    op.drop_table("remittance")
    op.drop_table("saved_recipient")
    op.drop_table("goal_contribution")
    op.drop_table("goal")
    op.drop_table("savings_contribution")
    op.drop_table("savings_account")
    op.drop_table("target_streak")
    op.drop_table("revenue_target")
    op.drop_table("other_expense")
    op.drop_table("financial_rule_config")
    op.drop_table("family_relationship_master")
    op.drop_table("goal_type_master")
    op.drop_table("expense_category_master")
