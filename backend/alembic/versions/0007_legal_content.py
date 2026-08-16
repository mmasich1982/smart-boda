# backend/alembic/versions/0007_legal_content.py
# NEW -- backs the Admin Console's Legal Content editor and rider-app's Terms/Privacy
# screens, neither of which had any admin-editable storage in any developer guide.
from alembic import op
import sqlalchemy as sa

revision = "0007_legal_content"
down_revision = "0006_suggestion_category_master"


def upgrade():
    op.create_table(
        "legal_content",
        sa.Column("key", sa.String(40), primary_key=True),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.bulk_insert(
        sa.table(
            "legal_content",
            sa.column("key", sa.String),
            sa.column("content", sa.Text),
        ),
        [
            {"key": "terms_of_service", "content": "Terms of Service -- placeholder content. Edit from the Super Admin Console."},
            {"key": "data_privacy", "content": "Data Privacy Policy -- placeholder content. Edit from the Super Admin Console."},
        ],
    )


def downgrade():
    op.drop_table("legal_content")
