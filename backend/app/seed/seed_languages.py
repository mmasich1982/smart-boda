# backend/app/seed/seed_languages.py
from app.database import SessionLocal
from app.models.master_data import LanguageMaster

# BR-SB01-011: MVP0 activates exactly two languages. The remaining eight are seeded
# as inactive placeholders so MVP1 only needs a content review + one flag flip —
# never a schema or code change.
LANGUAGES = [
    {"code": "en",  "display_name": "English",     "sort_order": 1, "is_active": True},   # MVP0
    {"code": "sw",  "display_name": "Kiswahili",   "sort_order": 2, "is_active": True},   # MVP0
    {"code": "ki",  "display_name": "Gĩkũyũ",     "sort_order": 3, "is_active": False},  # MVP1
    {"code": "kam", "display_name": "Kikamba",    "sort_order": 4, "is_active": False},  # MVP1
    {"code": "luo", "display_name": "Dholuo",     "sort_order": 5, "is_active": False},  # MVP1
    {"code": "luy", "display_name": "Luluhya",    "sort_order": 6, "is_active": False},  # MVP1
    {"code": "kln", "display_name": "Kalenjin",   "sort_order": 7, "is_active": False},  # MVP1
    {"code": "so",  "display_name": "Af-Soomaali", "sort_order": 8, "is_active": False},  # MVP1
    {"code": "ebu", "display_name": "Kĩembu",     "sort_order": 9, "is_active": False},  # MVP1
    {"code": "mer", "display_name": "Kĩmĩrũ",     "sort_order": 10, "is_active": False}, # MVP1
]

def run():
    db = SessionLocal()
    for lang in LANGUAGES:
        db.merge(LanguageMaster(**lang))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()
