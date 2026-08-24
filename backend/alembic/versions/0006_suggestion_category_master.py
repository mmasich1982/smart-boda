# backend/alembic/versions/0006_suggestion_category_master.py
# NEW -- suggestion.py's model references this table via ForeignKey, but no guide ever
# created it anywhere (not even Module E, where Suggestion/SuggestionsFeedbackScreen live).
# Added here as the final migration in the chain so `alembic upgrade head` doesn't crash
# the first time anyone submits a categorized suggestion.
from alembic import op
import sqlalchemy as sa

revision = "0006_suggestion_category_master"
down_revision = "0005_module_e_compliance_history"


def upgrade():
    op.create_table(
        "suggestion_category_master",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )
    # A reasonable, editable-later starter set so the dropdown isn't empty on first launch.
    op.bulk_insert(
        sa.table(
            "suggestion_category_master",
            sa.column("code", sa.String),
            sa.column("display_name", sa.String),
            sa.column("sort_order", sa.Integer),
        ),
        [
            {"code": "bug", "display_name": "Something's not working", "sort_order": 1},
            {"code": "idea", "display_name": "I have an idea", "sort_order": 2},
            {"code": "pricing", "display_name": "About pricing/subscription", "sort_order": 3},
            {"code": "other", "display_name": "Something else", "sort_order": 4},
        ],
    )


def downgrade():
    op.drop_table("suggestion_category_master")
