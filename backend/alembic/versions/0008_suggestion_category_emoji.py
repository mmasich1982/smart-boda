# backend/alembic/versions/0008_suggestion_category_emoji.py
"""
Alembic migration: Add emoji column to suggestion_category_master and seed RA-35 categories.
Revision ID: 0008
Revises: 0007_legal_content
Create Date: 2024-08-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = '0008'
down_revision = '0007_legal_content'
branch_labels = None
depends_on = None


def upgrade():
    # Add emoji column to suggestion_category_master if it doesn't exist
    op.add_column(
        'suggestion_category_master',
        sa.Column('emoji', sa.String(10), nullable=True)
    )

    # Seed the standard RA-35 suggestion categories with emojis
    connection = op.get_bind()
    
    categories = [
        ('Idea', '💡', 'I Have An Idea', 1),
        ('Problem', '😕', 'Something\'s Wrong', 2),
        ('Compliment', '❤️', 'Just Saying Thanks', 3),
        ('Other', '💬', 'Something Else', 4),
    ]

    for code, emoji, display_name, sort_order in categories:
        # Use "INSERT ... ON CONFLICT DO UPDATE" for idempotency
        connection.execute(f"""
            INSERT INTO suggestion_category_master (code, emoji, display_name, sort_order, is_active)
            VALUES ('{code}', '{emoji}', '{display_name}', {sort_order}, true)
            ON CONFLICT (code) DO UPDATE SET
                emoji = EXCLUDED.emoji,
                display_name = EXCLUDED.display_name,
                sort_order = EXCLUDED.sort_order,
                is_active = EXCLUDED.is_active;
        """)


def downgrade():
    op.drop_column('suggestion_category_master', 'emoji')
