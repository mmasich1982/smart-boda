# backend/app/models/__init__.py
# Import all models here so they're registered with Base.metadata during application startup.
# FIXED: Added missing imports from subscription_enhanced.py

from app.models.admin_user import AdminUser
from app.models.bike_profile import BikeProfile, DuplicatePlateCase
from app.models.compliance_document import ComplianceDocument
from app.models.compliance_master_data import (
    DocumentTypeMaster,
    StatementPurposeMaster,
    ComplianceRuleConfig,
)
from app.models.data_export_reason_master import DataExportReasonMaster
from app.models.data_export_request import DataExportRequest
from app.models.expense_category_master import ExpenseCategoryMaster
from app.models.family_relationship_master import FamilyRelationshipMaster
from app.models.financial_master_data import FinancialRuleConfig
from app.models.fuel_entry import FuelEntry
from app.models.fuel_master_data import FuelMaintenanceRuleConfig
from app.models.goal import Goal
from app.models.goal_contribution import GoalContribution
from app.models.goal_type_master import GoalTypeMaster
from app.models.legal_content import LegalContent
from app.models.lipa_later_record import LipaLaterRecord
from app.models.maintenance_entry import MaintenanceEntry
from app.models.master_data import (
    LanguageMaster,
    FuelTypeMaster,
    UiStringMaster,
    ValuePreviewConfig,
)
from app.models.oil_type_master import OilTypeMaster
from app.models.other_expense import OtherExpense
from app.models.out_of_window_request import OutOfWindowRequest
from app.models.payment import Payment
from app.models.pin_recovery_request import PinRecoveryRequest
from app.models.remittance import Remittance
from app.models.revenue_target import RevenueTarget
from app.models.rider import Rider
from app.models.saved_recipient import SavedRecipient
from app.models.savings_account import SavingsAccount
from app.models.savings_contribution import SavingsContribution
from app.models.service_type_master import ServiceTypeMaster
from app.models.statement import Statement
from app.models.statement_download import StatementDownload
from app.models.subscription import SubscriptionPlan, RiderSubscription
# ✅ FIXED: ADD THIS IMPORT - Imports the 4 models from subscription_enhanced
from app.models.subscription_enhanced import (
    PricingChangeLog, PendingPriceChange, SubscriptionTrial, AccountLockHistory
)
from app.models.suggestion import Suggestion
from app.models.suggestion_category_master import SuggestionCategoryMaster
from app.models.swap_partner_master import SwapPartnerMaster
from app.models.target_streak import TargetStreak
from app.models.trip import Trip
from app.models.trip_master_data import (
    PaymentChannelMaster,
    CorrectionReasonMaster,
    TripEntryRuleConfig,
)

OutOfWindowCorrectionRequest = OutOfWindowRequest

__all__ = [
    "AdminUser",
    "BikeProfile",
    "DuplicatePlateCase",
    "ComplianceDocument",
    "DocumentTypeMaster",
    "StatementPurposeMaster",
    "ComplianceRuleConfig",
    "DataExportReasonMaster",
    "DataExportRequest",
    "ExpenseCategoryMaster",
    "FinancialRuleConfig",
    "FamilyRelationshipMaster",
    "FuelEntry",
    "FuelMaintenanceRuleConfig",
    "OilTypeMaster",
    "FuelTypeMaster",
    "Goal",
    "GoalContribution",
    "GoalTypeMaster",
    "LegalContent",
    "LipaLaterRecord",
    "MaintenanceEntry",
    "LanguageMaster",
    "UiStringMaster",
    "ValuePreviewConfig",
    "OtherExpense",
    "OutOfWindowRequest",
    "OutOfWindowCorrectionRequest",
    "Payment",
    "PinRecoveryRequest",
    "Remittance",
    "RevenueTarget",
    "Rider",
    "SavedRecipient",
    "SavingsAccount",
    "SavingsContribution",
    "ServiceTypeMaster",
    "Statement",
    "StatementDownload",
    "SubscriptionPlan",
    "RiderSubscription",
    # ✅ FIXED: Now these are imported and can be exported
    "PricingChangeLog",
    "PendingPriceChange",
    "SubscriptionTrial",
    "AccountLockHistory",
    "Suggestion",
    "SuggestionCategoryMaster",
    "SwapPartnerMaster",
    "TargetStreak",
    "Trip",
    "PaymentChannelMaster",
    "CorrectionReasonMaster",
    "TripEntryRuleConfig",
]