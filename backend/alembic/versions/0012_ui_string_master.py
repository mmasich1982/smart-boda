# backend/alembic/versions/ui_string_master.py
from alembic import op
import sqlalchemy as sa

revision = "0012_ui_string_master"
down_revision = "0011_battery_range_km"

def upgrade():
    # BR-SB01-011 / BR-SB03-012: ALL copy — labels, errors, toasts — lives here.
    op.create_table(
        "ui_string_master",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("string_key", sa.String(120), nullable=False),          # e.g. "number.title"
        sa.Column("language_code", sa.String(10), sa.ForeignKey("language_master.code"), nullable=False),
        sa.Column("translated_text", sa.Text, nullable=False),
        sa.Column("needs_review", sa.Boolean, server_default="true"),          # true until a native-speaking reviewer signs off
        sa.Column("reviewed_by", sa.String(80)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_ui_string_key_lang", "ui_string_master", ["string_key", "language_code"])

def downgrade():
    op.drop_table("ui_string_master")
