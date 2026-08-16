# backend/app/seed/seed_compliance_master_data.py
from app.database import SessionLocal
from app.models.compliance_master_data import DocumentTypeMaster, StatementPurposeMaster, ComplianceRuleConfig
from app.models.data_export_reason_master import DataExportReasonMaster

# BR-SB18-002: exactly these 2 tracked types in MVP0 — no Logbook, no National ID, both expire,
# and neither carries any external pathway/URL. Renewal is always done directly inside the app.
DOCUMENT_TYPES = [
    {"code": "psv_licence", "display_name": "PSV Licence", "expires": True, "sort_order": 1},
    {"code": "insurance_certificate", "display_name": "Insurance Certificate", "expires": True, "sort_order": 2},
]
STATEMENT_PURPOSES = [
    {"code": "loan_application", "display_name": "Loan Application", "sort_order": 1},
    {"code": "sacco_good_standing", "display_name": "SACCO Good Standing", "sort_order": 2},
    {"code": "insurance_application", "display_name": "Insurance Application", "sort_order": 3},
    {"code": "general_personal_use", "display_name": "General/Personal Use", "sort_order": 4},
]

# ADDED (docx #2): the configurable drop-list of data-export reasons.
DATA_EXPORT_REASONS = [
    {"code": "closing_account", "display_name": "Closing my account", "sort_order": 1},
    {"code": "personal_records", "display_name": "For my personal records", "sort_order": 2},
    {"code": "switching_apps", "display_name": "Switching to another app", "sort_order": 3},
    {"code": "other", "display_name": "Other", "sort_order": 4},
]

def run():
    db = SessionLocal()
    for row in DOCUMENT_TYPES: db.merge(DocumentTypeMaster(**row))
    for row in STATEMENT_PURPOSES: db.merge(StatementPurposeMaster(**row))
    for row in DATA_EXPORT_REASONS: db.merge(DataExportReasonMaster(**row))
    db.merge(ComplianceRuleConfig(id=1, expiry_reminder_first_days=5, expiry_reminder_final_days=3,
                                   transaction_list_page_size=20, statement_history_page_size=10,
                                   data_export_delivery_hours=48, statement_delivery_hours=48))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()
