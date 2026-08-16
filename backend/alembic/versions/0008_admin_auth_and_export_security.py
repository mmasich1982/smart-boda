# alembic/versions/0008_admin_auth_and_export_security.py
# Backs three things added after the engineering audits:
#  1. Admin Console §2 fix: a real admin_user table so require_super_admin/require_admin
#     in app/auth.py have something to check against (role actually enforced now).
#  2. ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #2/#3: PIN-gated Data Export + Detailed
#     Statement request flows, each capturing a verified contact email (+ a configurable
#     reason for data export), with a configurable admin-adjustable delivery window.
#  3. rider.email: neither security flow can "direct them to a screen prompting entry of
#     their verified email address" without somewhere to verify that email against.
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_admin_auth_and_export_security"
down_revision = "0007_legal_content"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "admin_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(120), unique=True, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="support_admin"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column("rider", sa.Column("email", sa.String(120), nullable=True))
    op.add_column("rider", sa.Column("email_verified", sa.Boolean, server_default="false"))

    op.create_table(
        "data_export_reason_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    op.add_column("data_export_request", sa.Column("reason_code", sa.String(30),
                  sa.ForeignKey("data_export_reason_master.code"), nullable=True))
    op.add_column("data_export_request", sa.Column("contact_email", sa.String(120), nullable=True))
    op.add_column("data_export_request", sa.Column("pin_verified_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("statement", sa.Column("contact_email", sa.String(120), nullable=True))
    op.add_column("statement", sa.Column("delivery_requested", sa.Boolean, server_default="false"))
    op.add_column("statement", sa.Column("pin_verified_at", sa.DateTime(timezone=True), nullable=True))

    # BR (docx #2/#3): "the 48-hour timeline must be configurable" for BOTH flows,
    # via the same Compliance Master Data rule-config screen admins already use.
    op.add_column("compliance_rule_config", sa.Column("data_export_delivery_hours", sa.Integer, server_default="48"))
    op.add_column("compliance_rule_config", sa.Column("statement_delivery_hours", sa.Integer, server_default="48"))


def downgrade():
    op.drop_column("compliance_rule_config", "statement_delivery_hours")
    op.drop_column("compliance_rule_config", "data_export_delivery_hours")
    op.drop_column("statement", "pin_verified_at")
    op.drop_column("statement", "delivery_requested")
    op.drop_column("statement", "contact_email")
    op.drop_column("data_export_request", "pin_verified_at")
    op.drop_column("data_export_request", "contact_email")
    op.drop_column("data_export_request", "reason_code")
    op.drop_table("data_export_reason_master")
    op.drop_column("rider", "email_verified")
    op.drop_column("rider", "email")
    op.drop_table("admin_user")
