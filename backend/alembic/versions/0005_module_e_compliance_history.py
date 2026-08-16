# backend/alembic/versions/module_e_compliance_history.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_module_e_compliance_history"
down_revision = "0004_module_d_financial_performance"

def upgrade():
    # ---- Document Type Master Data (BR-SB18-002) ----
    op.create_table(
        "document_type_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("expires", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Statement Purpose Master Data (BR-SB20-003) ----
    op.create_table(
        "statement_purpose_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # ---- Trip & Entry Rule Configuration additions (this batch) ----
    op.create_table(
        "compliance_rule_config",
        sa.Column("id", sa.Integer, primary_key=True),  # single-row config table
        sa.Column("expiry_reminder_first_days", sa.Integer, server_default="5"),   # BR-SB18-006
        sa.Column("expiry_reminder_final_days", sa.Integer, server_default="3"),
        sa.Column("transaction_list_page_size", sa.Integer, server_default="20"),  # BR-SB19-010
        sa.Column("statement_history_page_size", sa.Integer, server_default="10"),  # BR-SB20-010
    )

    # ---- Compliance Document, archive-on-renew (BR-SB18-004/010) ----
    op.create_table(
        "compliance_document",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("document_type_code", sa.String(30), sa.ForeignKey("document_type_master.code"), nullable=False),
        sa.Column("expiry_date", sa.Date),  # null for non-expiring types
        sa.Column("archived", sa.Boolean, server_default="false"),
        sa.Column("reminder_5day_shown", sa.Boolean, server_default="false"),  # BR-SB18-006: per-document, independent flags
        sa.Column("reminder_3day_shown", sa.Boolean, server_default="false"),
        sa.Column("sync_status", sa.String(20), server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---- Statement, figures frozen at generation (BR-SB20-009) ----
    op.create_table(
        "statement",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("purpose_code", sa.String(30), sa.ForeignKey("statement_purpose_master.code")),  # optional
        sa.Column("income", sa.Numeric(10, 2), nullable=False),          # frozen at generation, BR-SB20-009
        sa.Column("total_expense", sa.Numeric(10, 2), nullable=False),
        sa.Column("net_profit", sa.Numeric(10, 2), nullable=False),
        sa.Column("verification_reference", sa.String(20)),  # null until online registration completes
        sa.Column("verified", sa.Boolean, server_default="false"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sync_status", sa.String(20), server_default="pending"),
    )
    op.create_table(
        "statement_download",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("statement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("statement.id"), nullable=False),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False),  # BR-SB20-006: one row per download event
    )

    # ---- Data Export Request (BR-SB21) ----
    op.create_table(
        "data_export_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rider.id"), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),  # pending | fulfilled, BR-SB21-006 manual on Super Admin side
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True)),
    )

def downgrade():
    op.drop_table("data_export_request")
    op.drop_table("statement_download")
    op.drop_table("statement")
    op.drop_table("compliance_document")
    op.drop_table("compliance_rule_config")
    op.drop_table("statement_purpose_master")
    op.drop_table("document_type_master")
