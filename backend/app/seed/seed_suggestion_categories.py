# backend/app/seed/seed_suggestion_categories.py
"""
Seed data for suggestion categories (RA-35).
Call this during app initialization to ensure suggestion categories are available.
"""
from sqlalchemy.orm import Session
from app.models.suggestion_category_master import SuggestionCategoryMaster


SUGGESTION_CATEGORIES = [
    {
        'code': 'Idea',
        'emoji': '💡',
        'display_name': 'I Have An Idea',
        'sort_order': 1,
        'is_active': True
    },
    {
        'code': 'Problem',
        'emoji': '😕',
        'display_name': 'Something\'s Wrong',
        'sort_order': 2,
        'is_active': True
    },
    {
        'code': 'Compliment',
        'emoji': '❤️',
        'display_name': 'Just Saying Thanks',
        'sort_order': 3,
        'is_active': True
    },
    {
        'code': 'Other',
        'emoji': '💬',
        'display_name': 'Something Else',
        'sort_order': 4,
        'is_active': True
    },
]


def seed_suggestion_categories(db: Session):
    """
    Seed or update suggestion categories in the database.
    Idempotent: safe to call multiple times.
    """
    for cat_data in SUGGESTION_CATEGORIES:
        existing = db.query(SuggestionCategoryMaster).filter_by(code=cat_data['code']).first()
        if existing:
            # Update existing record
            for key, value in cat_data.items():
                setattr(existing, key, value)
        else:
            # Create new record
            new_cat = SuggestionCategoryMaster(**cat_data)
            db.add(new_cat)
    db.commit()