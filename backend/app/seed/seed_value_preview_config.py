# backend/app/seed/seed_value_preview_config.py
from app.database import SessionLocal
from app.models.master_data import ValuePreviewConfig

# SB-01-B: illustrative sample figures per language, seeded into value_preview_config.
# These are shown on ValuePreviewScreen (retention hook before onboarding continues).
# MVP0 uses the same illustrative figures for both English and Kiswahili.
VALUE_PREVIEW_CONFIGS = [
    {
        "language_code": "en",
        "sample_weekly_earnings_ksh": 14200.00,
        "sample_weekly_costs_ksh": 3650.00,
        "sample_cost_breakdown_json": {
            "fuel": 2400,
            "maintenance": 800,
            "insurance": 450
        }
    },
    {
        "language_code": "sw",
        "sample_weekly_earnings_ksh": 14200.00,
        "sample_weekly_costs_ksh": 3650.00,
        "sample_cost_breakdown_json": {
            "fuel": 2400,
            "maintenance": 800,
            "insurance": 450
        }
    },
]

def run():
    db = SessionLocal()
    for config in VALUE_PREVIEW_CONFIGS:
        db.merge(ValuePreviewConfig(**config))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()