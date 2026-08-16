# backend/app/seed/seed_ui_strings.py
# CORRECTED: All translation keys for Home Screen, New Trip Screen, and Lipa Later Screens
# - home.running_total: "Today's Running Fare Total"
# - home.new_trip_cta: "+ New Trip" (for Home Screen button)
# - trip.screen_title: "New Trip" (for New Trip Screen title)
# - trip.save_button: "Save Trip →" (for Save button)
# - lipa_later.* keys for all Lipa Later fields and buttons

from app.database import SessionLocal
from app.models.master_data import UiStringMaster

# English strings - the reviewed source of truth
STRINGS_EN = {
    # ===== LANGUAGE SELECTION (SB-01) =====
    "lang.title": "Karibu! Welcome",
    "lang.subtitle": "Pick your language. It only takes one tap.",
    "lang.continue": "Continue →",
    
    # ===== VALUE PREVIEW (SB-02) =====
    "preview.eyebrow": "✨ A peek at what's waiting for you",
    "preview.title": "This Could Be Your Week 💰",
    "preview.subtitle": "This is what riders see every week, once their bike is set up.",
    "preview.illustrative_label": "Illustrative example",
    "preview.earned_label": "Money earned",
    "preview.cost_label": "Fuel & service",
    "preview.net_label": "Money kept (profit)",
    "preview.hint": "We work out these numbers for you, from your trips. No pen. No paper. No guessing.",
    "preview.cta": "Set Up My Bike Now →",
    "preview.fallback": "Track your daily boda earnings, costs, and profit — automatically.",
    
    # ===== BIKE PROFILE (SB-03) =====
    "bike.title": "Set Up Your Bike",
    "bike.subtitle": "A few quick details and this bike is fully set up. Works even with no internet.",
    "bike.plate_label": "Number Plate",
    "bike.plate_required": "Number plate is required.",
    "bike.fuel_label": "Fuel Type",
    "bike.fuel_required": "Please select Petrol or Electric.",
    "bike.local_duplicate_warning": "This plate looks familiar — you can continue, we'll double-check once you're online.",
    "bike.global_duplicate_warning": "This number plate is already registered to another rider.",
    "bike.saved": "Bike details saved. Continuing setup…",
    "bike.trust_note": "Saved straight to your phone and kept private — it just helps us set your tools up right.",
    
    # ===== MOBILE NUMBER (SB-04) =====
    "number.title": "One Last Step",
    "number.subtitle": "Enter your mobile number to continue.",
    "number.label": "Mobile Number",
    "number.invalid": "Enter a valid Kenyan mobile number.",
    "number.duplicate": "This number is already registered. Log in instead?",
    "number.error": "We couldn't save your number. Please try again.",
    "number.saving": "Saving…",
    "number.continue": "Continue →",
    "number.bonus_banner": "🎁 Unlock 2 free days of Smart Boda Access — clear, simple insights into your earnings and expenses from your very first trip.",
    
    # ===== PROFILE CONFIRMATION (SB-04-B) =====
    "profile.title": "Confirm your profile please 🙂",
    "profile.name_label": "Full Name",
    "profile.name_placeholder": "e.g. James Otieno",
    "profile.name_hint": "You can edit this anytime later.",
    "profile.name_required": "Full name is required.",
    "profile.name_duplicate": "This full name is already registered. Please check your details.",
    "profile.consent_prefix": "I accept the",
    "profile.terms_link": "Terms of Service",
    "profile.consent_middle": "and",
    "profile.privacy_link": "Data Privacy Notice",
    "profile.consent_suffix": ".",
    "profile.consent_required": "Please accept the Terms and Privacy Notice to continue.",
    "profile.save_error": "We couldn't save your profile. Please try again.",
    "profile.online_badge": "● Online — Activating",
    "profile.offline_badge": "● Offline — Will Activate on Reconnect",
    "profile.continue": "Continue →",
    
    # ===== PIN MANAGEMENT (SB-02-A, SB-02-B, SB-02-C) =====
    "pin.create_title": "Create your login PIN",
    "pin.create_subtitle": "You'll use this 4-digit PIN to log back in every time you reopen the app.",
    "pin.confirm_title": "Confirm your login PIN",
    "pin.confirm_subtitle": "Enter it once more to confirm.",
    "pin.weak_pin": "This PIN is too simple. Please choose a harder one. Avoid 1234, 0000, or repeated digits.",
    "pin.mismatch": "🙂 Those two didn't quite match — give it another try.",
    "pin.login_title": "Enter your 4-digit PIN to continue.",
    "pin.incorrect": "Incorrect PIN. {attempts_left} attempt(s) remaining.",
    "pin.locked": "Too many incorrect attempts. Try again later.",
    "pin.forgot_link": "Forgot PIN? Request help",
    "pin.reveal_hint": "Tap 👁️ to check what you've typed",
    "pin.continue_button": "Continue →",
    "pin.confirm_button": "Confirm",
    "pin.created_success": "PIN created. Welcome to Smart Boda Digital!",
    "pin.error_create": "Failed to create PIN. Please try again.",
    "pin.error_connection": "Unable to create PIN. Please check your connection and try again.",
    "pin.error_invalid_format": "Invalid PIN format. Please use a 4-digit number.",
    "pin.error_already_exists": "This rider already has a PIN set.",
    "pin.error_not_found": "Rider profile not found. Please restart onboarding.",
    "pin.error_server": "Server error. Please try again later.",
    "pin.error_request": "Request error. Please try again.",
    "pin.error_no_response": "No response from server. Please check your connection.",
    "pin.error_timeout": "Request timed out. Please try again.",
    "pin.recovery.title": "Forgot Your PIN?",
    "pin.recovery.subtitle": "Enter your mobile number. Our team verifies it's really you before you can set a new PIN.",
    "pin.recovery.submit": "Request PIN Reset",
    "pin.recovery.back_to_login": "Back to Login",
    "pin.recovery.pending_icon": "🕒 Review pending",
    "pin.recovery.pending": "Request submitted. This is reviewed by our team — please check back soon.",
    "pin.recovery.check_again": "Check Again",
    "pin.recovery.not_yet": "Still under review. Please try again later.",
    "pin.recovery.verified_success": "Identity verified! Please set a new PIN.",
    "pin.recovery.set_new_title": "Set a new PIN",
    "pin.recovery.confirm_new_title": "Confirm your new PIN",
    "pin.recovery.reset_success": "Your PIN has been reset.",
    
    # ===== DUPLICATE PLATE REVIEW =====
    "duplicate.title": "We're Reviewing a Plate Match",
    "duplicate.body": "Your bike's number plate matches another rider's account. Our team is checking this manually to make sure everything is correct.",
    "duplicate.status_label": "Status",
    "duplicate.checking": "Checking…",
    "duplicate.pending": "⏳ Pending Review",
    "duplicate.resolved": "✅ Resolved",
    "duplicate.reassure": "Good news: your account is not suspended. You can keep logging trips, fuel, and everything else while we confirm this — nothing here blocks you.",
    "duplicate.continue": "Continue to Home",
    
    # ===== HOME SCREEN (SB-03-B) =====
    "home.running_total": "Today's Running Fare Total",
    "home.new_trip_button": "+ New Trip",
    "home.logged_out": "Logged out successfully.",
    "home.reconnect_48h": "🔴 Important: please connect to the internet now to sync and avoid missing critical updates. Offline for {hours}h.",
    "home.reconnect_24h": "🟡 Please go online briefly to back up your data. Offline for {hours}h.",
    "home.remind_1h": "Remind me in 1 hour",
    "home.trial_banner": "🎁 Enjoy {days} day{days > 1 ? 's' : ''} of free access.",
    "home.banner_tap_here": "Tap here to subscribe",
    "home.yesterday_total": "🌙 Yesterday's Total",
    "home.view_breakdown_link": "View full breakdown in Financial History →",
    "home.complete_bike_profile": "🏍️ Complete Bike Profile — 2 minutes. Unlocks fuel tracking and the right tools for how you hold your bike.",
    "home.complete_now": "Complete now",
    "home.duplicate_plate_warning": "⚠️ We found an issue with a bike's plate number.",
    "home.resolve_now": "Resolve now →",
    "home.tile_fuel_motorcycle": "Fuel Motorcycle",
    "home.tile_charge_battery": "Charge Battery",
    "home.tile_service_motorcycle": "Service Motorcycle",
    "home.tile_financial_performance": "My Financial Performance",
    "home.tile_revenue_targets": "My Revenue Targets",
    "home.tile_license_insurance": "My License and Insurance",
    "home.tile_savings": "My Savings",
    "home.tile_lipa_later_report": "Lipa Later Customers Report",
    "home.tile_send_money_home": "Send Money Home",
    "home.tile_my_goals": "My Goals",
    "home.tile_my_subscription": "My Subscription",
    "home.tile_suggestions_feedback": "Suggestions & Feedback",
    "home.sync_status": "Sync Status",
    "home.queued": "Queued: {count}",
    "home.all_synced": "All Synced",
    "home.tap_sync_queue": "Tap to view queue and retry.",
    "home.all_backed_up": "Everything is safely backed up.",
    "home.account": "Account",
    "home.rider_id": "Rider ID",
    "home.bike_registered": "Bike Registered",
    "home.trips_today": "Trips today",
    "home.settings_daily_trade_summary": "My Daily Trade Summary",
    "home.settings_financial_history": "My Financial History & Statements",
    "home.settings_settings_bike": "My Settings & Bike Profile",
    "home.settings_logout": "Log Out",
    "home.paywall_title": "Your subscription has ended — but nothing is lost",
    "home.paywall_body": "Every trip, shilling, and document you've logged is still safe and waiting for you. Subscribe for as little as KSh 99/day — less than a cup of tea — and everything switches back on instantly.",
    "home.paywall_cta": "🚀 Subscribe & Unlock Everything →",
    
    # ===== NEW TRIP SCREEN (SB-05: Trip Entry) =====
    "trip.screen_title": "New Trip",
    "trip.new_cta": "+ New Trip",
    "trip.payment_method_label": "Payment Method",
    "trip.save_button": "Save Trip →",
    "trip.offline_hint": "Works fully offline — saved instantly either way.",
    "trip.amount_required": "A trip needs a fare amount greater than zero.",
    "trip.channel_required": "Select a payment method to continue.",
    "trip.saved_online": "Trip saved! Today's total: KSh {total}.",
    "trip.saved_offline": "Trip saved on your phone. Will sync once you're online.",
    
    # ===== TRIP DETAIL SCREEN (SB-06) =====
    "trip.detail_title": "Trip Detail",
    "trip.locked_banner": "This trip can no longer be edited directly — its 24-hour correction window has closed.",
    "trip.original_amount": "Original amount",
    "trip.method": "Method",
    "trip.recorded": "Recorded",
    "trip.request_correction": "Request Correction →",
    "trip.oow_submitted": "Your correction request has been submitted. We'll update you within 72 hours.",
    "trip.remaining_hours": "Editable for {hours} more hours",
    
    # ===== TRIP CORRECTION (SB-07) =====
    "trip.corrected_amount_label": "Corrected Fare Amount",
    "trip.corrected_amount_required": "Corrected amount must be greater than zero.",
    "trip.corrected_method_label": "Corrected Payment Method",
    "trip.reason_label": "Correction Reason",
    "trip.reason_required": "Select a Correction Reason to continue.",
    "trip.reason_required_void": "Select a Correction Reason before voiding.",
    "trip.save_correction": "Save Correction →",
    "trip.corrected_toast": "Trip updated. Today's total is now KSh {total}.",
    "trip.void_panel_title": "Void This Trip",
    "trip.void_confirm_label": "I confirm this trip should be permanently removed from today's total.",
    "trip.void_confirm_required": "Please confirm the Void action — this is a second, deliberate step.",
    "trip.void_button": "Void Trip",
    "trip.voided_toast": "Trip removed from today's total. You can view voided trips anytime.",
    "trip.save_error": "Error saving trip",
    
    # ===== LIPA LATER DETAILS SCREEN (SB-05-E: Lipa Later Entry) =====
    "lipa_later.details_title": "Lipa Later Details",
    "lipa_later.customer_name_label": "Customer Name",
    "lipa_later.customer_name_required": "Customer name is required.",
    "lipa_later.customer_name_placeholder": "e.g. Wanjiru Kamau",
    "lipa_later.customer_mobile_label": "Customer Mobile Number",
    "lipa_later.customer_mobile_required": "Customer mobile number is required.",
    "lipa_later.customer_mobile_placeholder": "e.g. 0712 345 678",
    "lipa_later.amount_label": "Amount to be Paid Later (KSh)",
    "lipa_later.amount_required": "Amount must be greater than zero.",
    "lipa_later.amount_placeholder": "0",
    "lipa_later.due_date_label": "Payment Due Date",
    "lipa_later.due_date_required": "Due date is required.",
    "lipa_later.due_date_hint": "Must be after today — Lipa Later is for future payment, not today.",
    "lipa_later.save": "Save →",
    "lipa_later.saved": "Lipa Later record saved successfully!",
    
    # ===== LIPA LATER CUSTOMERS SCREEN (SB-05-E-2: Lipa Later Customers Report) =====
    "lipa_later.customers_title": "Lipa Later Customers",
    "lipa_later.customers_subtitle": "{count} customer{count > 1 ? 's' : ''}",
    "lipa_later.search_placeholder": "Search by name or mobile...",
    "lipa_later.clear": "Clear",
    "lipa_later.no_customers": "No pending Lipa Later customers",
    "lipa_later.no_search_results": "No matching customers found",
    "lipa_later.view_ageing": "View Payment Ageing",
    "lipa_later.view_button": "View",
    "lipa_later.overdue_days": "{days} day{days > 1 ? 's' : ''} overdue",
    "lipa_later.due_today": "Due today",
    
    # ===== LIPA LATER AGEING REPORT SCREEN (SB-05-E-3: Lipa Later Ageing Report) =====
    "lipa_later.ageing_report_title": "Lipa Later Ageing Report",
    "lipa_later.ageing_by_status": "Analysis by Status",
    "lipa_later.current": "Current",
    "lipa_later.overdue": "Overdue",
    "lipa_later.very_overdue": "Very Overdue (>30 days)",
    
    # ===== SYNC AND CONNECTIVITY =====
    "sync.error_hint": "Sync encountered an issue. Offline mode is active.",
}

# Kiswahili strings - reviewed, native translation
STRINGS_SW = {
    # ===== LANGUAGE SELECTION =====
    "lang.title": "Karibu!",
    "lang.subtitle": "Chagua lugha yako. Ni mguso mmoja tu.",
    "lang.continue": "Endelea →",
    
    # ===== VALUE PREVIEW =====
    "preview.eyebrow": "✨ Muonekano wa kile kinachokukumbuia",
    "preview.title": "Hii Inaweza Kuwa Wiki Yako 💰",
    "preview.subtitle": "Hivi ndivyo waendesha bodaboda wanavyoona kila wiki, baada ya pikipiki yao kusajiliwa.",
    "preview.illustrative_label": "Mfano wa kielelezo",
    "preview.earned_label": "Pesa zilizotengana",
    "preview.cost_label": "Nishati na huduma",
    "preview.net_label": "Pesa zilizohifadhiwa (faida)",
    "preview.hint": "Tunahesabu namba hizi kwa ajili yako, kutoka kwa safari yako. Hakuna kalamu. Hakuna karatasi. Hakuna kubahatisha.",
    "preview.cta": "Sajili Pikipiki Yangu Sasa →",
    "preview.fallback": "Fuatilia mapato yako ya kila siku ya bodaboda, gharama, na faida — kiotomati.",
    
    # ===== BIKE PROFILE =====
    "bike.title": "Sajili Pikipiki Yako",
    "bike.subtitle": "Maelezo machache na pikipiki hii itajaliwa kabisa. Inafanya kazi hata bila mtandao.",
    "bike.plate_label": "Namba ya Usajili",
    "bike.plate_required": "Namba ya usajili inahitajika.",
    "bike.fuel_label": "Aina ya Nishati",
    "bike.fuel_required": "Tafadhali chagua Petroli au Umeme.",
    "bike.local_duplicate_warning": "Namba hii inafanana na iliyopo — unaweza kuendelea, tutathibitisha ukiwa mtandaoni.",
    "bike.global_duplicate_warning": "Namba hii ya usajili imesajiliwa tayari kwa endesha nyingine.",
    "bike.saved": "Maelezo ya pikipiki yalihifadhiwa. Kuendelea na usanidi…",
    "bike.trust_note": "Ilihifadhiwa moja kwa moja kwenye simu yako na inahifadhiwa ni siri — inatutuza tu kuandaa zana zako vizuri.",
    
    # ===== MOBILE NUMBER =====
    "number.title": "Hatua ya Mwisho",
    "number.subtitle": "Weka namba yako ya simu ili kuendelea.",
    "number.label": "Namba ya Simu",
    "number.invalid": "Weka namba sahihi ya simu ya Kenya.",
    "number.duplicate": "Namba hii imesajiliwa tayari. Ingia badala yake?",
    "number.error": "Haiwezi kuhifadhi namba yako. Tafadhali jaribu tena.",
    "number.saving": "Inahifadhiwa…",
    "number.continue": "Endelea →",
    "number.bonus_banner": "🎁 Fungua siku 2 za bure za Smart Boda — habari wazi, rahisi kuhusu mapato yako na gharama kutoka kwa safari yako ya kwanza.",
    
    # ===== PROFILE CONFIRMATION =====
    "profile.title": "Thibitisha wasifu wako tafadhali 🙂",
    "profile.name_label": "Jina Kamili",
    "profile.name_placeholder": "k.m. James Otieno",
    "profile.name_hint": "Unaweza kuhariri hii wakati wowote baadaye.",
    "profile.name_required": "Jina kamili linahitajika.",
    "profile.name_duplicate": "Jina hili kamili limesajiliwa tayari. Tafadhali angalia maelezo yako.",
    "profile.consent_prefix": "Nakubali",
    "profile.terms_link": "Masharti ya Huduma",
    "profile.consent_middle": "na",
    "profile.privacy_link": "Ilani ya Faragha",
    "profile.consent_suffix": ".",
    "profile.consent_required": "Tafadhali kubali Masharti na Ilani ya Faragha ili kuendelea.",
    "profile.save_error": "Haiwezi kuhifadhi wasifu wako. Tafadhali jaribu tena.",
    "profile.online_badge": "● Mtandaoni — Inamiliki",
    "profile.offline_badge": "● Isimu — Itamiliki Ukikuwa Mtandaoni",
    "profile.continue": "Endelea →",
    
    # ===== PIN MANAGEMENT =====
    "pin.create_title": "Unda PIN yako ya kuingia",
    "pin.create_subtitle": "Utatumia PIN hii ya tarakamu 4 kuingia tena kila wakati utafungulia programu.",
    "pin.confirm_title": "Thibitisha PIN yako ya kuingia",
    "pin.confirm_subtitle": "Weka kwa mara nyingine ili kuthiitisha.",
    "pin.weak_pin": "PIN hii ni rahisi sana. Tafadhali chagua ile ngumu zaidi. Epuka 1234, 0000, au tarakamu inayojirudia.",
    "pin.mismatch": "🙂 Hizo mbili hazikufanana — jaribu tena.",
    "pin.login_title": "Weka PIN yako ya tarakamu 4 ili kuendelea.",
    "pin.incorrect": "PIN haipo sahihi. Jaribio {attempts_left} limebaki.",
    "pin.locked": "Jaribio nyingi sana zisizofaa. Jaribu tena baadaye.",
    "pin.forgot_link": "Umesahau PIN? Omba msaada",
    "pin.reveal_hint": "Gusa 👁️ ili kuangalia ulichoandika",
    "pin.continue_button": "Endelea →",
    "pin.confirm_button": "Thibitisha",
    "pin.created_success": "PIN ilijifanywa. Karibu kwenye Smart Boda Digital!",
    "pin.error_create": "Haiwezi kujenga PIN. Tafadhali jaribu tena.",
    "pin.error_connection": "Haiwezi kujenga PIN. Tafadhali angalia muunganisho wako na jaribu tena.",
    "pin.error_invalid_format": "Muundo wa PIN hapo sahihi. Tafadhali tumia namba 4-tarakamu.",
    "pin.error_already_exists": "Endesha hii tayari ana PIN iliyowekwa.",
    "pin.error_not_found": "Wasifu wa endesha hauwezi kupatikana. Tafadhali anza kuandaa upya.",
    "pin.error_server": "Hitilafu ya seva. Tafadhali jaribu tena baadaye.",
    "pin.error_request": "Hitilafu ya ombi. Tafadhali jaribu tena.",
    "pin.error_no_response": "Hakuna jibu kutoka seva. Tafadhali angalia muunganisho wako.",
    "pin.error_timeout": "Ombi lilimalizwa kwa muda. Tafadhali jaribu tena.",
    "pin.recovery.title": "Umesahau PIN Yako?",
    "pin.recovery.subtitle": "Weka namba yako ya simu. Timu yetu itathibitisha ni wewe kabla ya kukuruhusu kuweka PIN mpya.",
    "pin.recovery.submit": "Omba Kuweka Upya PIN",
    "pin.recovery.back_to_login": "Rudi kwenye Kuingia",
    "pin.recovery.pending_icon": "🕒 Kukamatia Uzani",
    "pin.recovery.pending": "Ombi limewasilishwa. Hii inakaguliwa na timu yetu — tafadhali angalia tena hivi karibuni.",
    "pin.recovery.check_again": "Angalia Tena",
    "pin.recovery.not_yet": "Bado inakaguliwa. Tafadhali jaribu tena baadaye.",
    "pin.recovery.verified_success": "Utambulisho umethibitishwa! Tafadhali weka PIN mpya.",
    "pin.recovery.set_new_title": "Weka PIN mpya",
    "pin.recovery.confirm_new_title": "Thibitisha PIN yako mpya",
    "pin.recovery.reset_success": "PIN yako imewekwa upya.",
    
    # ===== DUPLICATE PLATE REVIEW =====
    "duplicate.title": "Tunakamatia Uzani wa Sahani",
    "duplicate.body": "Sahani ya namba ya pikipiki yako inafanana na akaunti ya endesha nyingine. Timu yetu inakagua hii kwa mikono ili kuhakikisha kila kitu ni sahihi.",
    "duplicate.status_label": "Hali",
    "duplicate.checking": "Inakagua…",
    "duplicate.pending": "⏳ Kukamatia Uzani",
    "duplicate.resolved": "✅ Kutatuliwa",
    "duplicate.reassure": "Habari njema: akaunti yako haipo iliyosimamishwa. Unaweza kuendelea kuandika safari, nishati, na kila kitu kingine wakati tunakamatia hii — hakuna kitu hapa kinakuzuia.",
    "duplicate.continue": "Endelea kwenye Nyumbani",
    
    # ===== HOME SCREEN =====
    "home.running_total": "Jumla ya Mapato ya Leo",
    "home.new_trip_button": "+ Safari Mpya",
    "home.logged_out": "Umefungua akaunti kwa mafanikio.",
    "home.reconnect_48h": "🔴 Muhimu: tafadhali kuunganisha na mtandao sasa ili kusawazisha na kuepuka kuchelewa maadhimisho muhimu. Iko bila mtandao {hours}h.",
    "home.reconnect_24h": "🟡 Tafadhali endelea mtandaoni kwa muda mfupi kuandaa data yako. Iko bila mtandao {hours}h.",
    "home.remind_1h": "Nikumbushe baada ya saa 1",
    "home.trial_banner": "🎁 Furahia siku {days} za ufikiaji wa bure.",
    "home.banner_tap_here": "Gusa hapa kusajili",
    "home.yesterday_total": "🌙 Jumla ya Jana",
    "home.view_breakdown_link": "Tazama muhtasari kamili katika Historia ya Fedha →",
    "home.complete_bike_profile": "🏍️ Kamata Wasifu wa Pikipiki — dakika 2. Inafungua kuorodha mafuta na zana sahihi za jinsi unaobakia pikipiki yako.",
    "home.complete_now": "Kamata sasa",
    "home.duplicate_plate_warning": "⚠️ Tumekutana na tatizo na namba ya usajili wa pikipiki.",
    "home.resolve_now": "Tatua sasa →",
    "home.tile_fuel_motorcycle": "Mafuta Pikipiki",
    "home.tile_charge_battery": "Chaji Betri",
    "home.tile_service_motorcycle": "Huduma Pikipiki",
    "home.tile_financial_performance": "Utendaji Wangu wa Fedha",
    "home.tile_revenue_targets": "Lengo Letu la Mapato",
    "home.tile_license_insurance": "Leseni Yangu na Bima",
    "home.tile_savings": "Akiba Yangu",
    "home.tile_lipa_later_report": "Ripoti ya Wateja wa Lipa Baadaye",
    "home.tile_send_money_home": "Tuma Pesa Nyumbani",
    "home.tile_my_goals": "Malengo Yangu",
    "home.tile_my_subscription": "Utoaji Wangu",
    "home.tile_suggestions_feedback": "Mapendekezo na Maoni",
    "home.sync_status": "Hali ya Kusawazisha",
    "home.queued": "Iliyoko: {count}",
    "home.all_synced": "Yote Iliyosawazishwa",
    "home.tap_sync_queue": "Gusa ili kuona foleni na jaribu tena.",
    "home.all_backed_up": "Kila kitu kinahifadhiwa kwa aman.",
    "home.account": "Akaunti",
    "home.rider_id": "Kitambulisho cha Endesha",
    "home.bike_registered": "Pikipiki Iliyosajiliwa",
    "home.trips_today": "Safaris leo",
    "home.settings_daily_trade_summary": "Muhtasari Wangu wa Biashara ya Kila Siku",
    "home.settings_financial_history": "Historia Yangu ya Fedha & Kauli",
    "home.settings_settings_bike": "Mipangilio Yangu & Wasifu wa Pikipiki",
    "home.settings_logout": "Fungua",
    "home.paywall_title": "Utoaji wako umekoma — lakini hakuna kilicho zipotea",
    "home.paywall_body": "Kila safari, shilling, na hati uliyoandika bado ni salama na inakukumbuia. Jusajili kwa wastani wa KSh 99 kwa siku — chini ya chaki cha chai — na kila kitu kinageuka nyuma papo hapo.",
    "home.paywall_cta": "🚀 Jusajili & Fungua Kila Kitu →",
    
    # ===== NEW TRIP SCREEN =====
    "trip.screen_title": "Safari Mpya",
    "trip.new_cta": "+ Safari Mpya",
    "trip.payment_method_label": "Njia ya Malipo",
    "trip.save_button": "Hifadhi Safari →",
    "trip.offline_hint": "Inafanya kazi bila mtandao — inahifadhiwa papo hapo kwa njia yoyote.",
    "trip.amount_required": "Safari inahitaji kodi kubwa kuliko sifuri.",
    "trip.channel_required": "Chagua njia ya malipo ili kuendelea.",
    "trip.saved_online": "Safari ilihifadhiwa! Jumla ya leo: KSh {total}.",
    "trip.saved_offline": "Safari ilihifadhiwa kwenye simu yako. Itasawazisha mara tu ukiwa mtandaoni.",
    
    # ===== TRIP DETAIL SCREEN =====
    "trip.detail_title": "Maelezo ya Safari",
    "trip.locked_banner": "Safari hii haiwezi kurediwa moja kwa moja — dirisha lake la kurekebishwa kwa saa 24 limefungwa.",
    "trip.original_amount": "Kiasi cha asili",
    "trip.method": "Njia",
    "trip.recorded": "Kurekodi",
    "trip.request_correction": "Omba Urekebishaji →",
    "trip.oow_submitted": "Ombi lako la urekebishaji limewasilishwa. Tutakufahamisha ndani ya saa 72.",
    "trip.remaining_hours": "Inaweza kuhairiwa kwa saa {hours} zaidi",
    
    # ===== TRIP CORRECTION =====
    "trip.corrected_amount_label": "Kodi iliyorekebishwa",
    "trip.corrected_amount_required": "Kiasi cha urekebishaji lazima kiwe kubwa kuliko sifuri.",
    "trip.corrected_method_label": "Njia ya Malipo iliyorekebishwa",
    "trip.reason_label": "Sababu ya Urekebishaji",
    "trip.reason_required": "Chagua Sababu ya Urekebishaji ili kuendelea.",
    "trip.reason_required_void": "Chagua Sababu ya Urekebishaji kabla ya kufanya batili.",
    "trip.save_correction": "Hifadhi Urekebishaji →",
    "trip.corrected_toast": "Safari iliyobadilishwa. Jumla ya leo sasa ni KSh {total}.",
    "trip.void_panel_title": "Fanya Batili Safari Hii",
    "trip.void_confirm_label": "Nathibitisha kwamba safari hii inapaswa kuondolewa kabisa kutoka jumla ya leo.",
    "trip.void_confirm_required": "Tafadhali thibitisha hatua ya Kufanya Batili — hii ni hatua ya pili na makusudi.",
    "trip.void_button": "Fanya Batili Safari",
    "trip.voided_toast": "Safari imeondolewa kutoka jumla ya leo. Unaweza kuangalia safari filizofa wakati wowote.",
    "trip.save_error": "Kosa la kuhifadhi safari",
    
    # ===== LIPA LATER DETAILS SCREEN =====
    "lipa_later.details_title": "Maelezo ya Lipa Baadaye",
    "lipa_later.customer_name_label": "Jina la Mteja",
    "lipa_later.customer_name_required": "Jina la mteja linahitajika.",
    "lipa_later.customer_name_placeholder": "k.m. Wanjiru Kamau",
    "lipa_later.customer_mobile_label": "Namba ya Simu ya Mteja",
    "lipa_later.customer_mobile_required": "Namba ya simu ya mteja inahitajika.",
    "lipa_later.customer_mobile_placeholder": "k.m. 0712 345 678",
    "lipa_later.amount_label": "Kiasi kinachopaswa Kulipwa Baadaye (KSh)",
    "lipa_later.amount_required": "Kiasi lazima kiwe kubwa kuliko sifuri.",
    "lipa_later.amount_placeholder": "0",
    "lipa_later.due_date_label": "Tarehe ya Malipo",
    "lipa_later.due_date_required": "Tarehe ya kufa inahitajika.",
    "lipa_later.due_date_hint": "Lazima iwe baada ya leo — Lipa Baadaye ni kwa malipo ya baadaye, si leo.",
    "lipa_later.save": "Hifadhi →",
    "lipa_later.saved": "Rekodi ya Lipa Baadaye ilihifadhiwa kwa mafanikio!",
    
    # ===== LIPA LATER CUSTOMERS SCREEN =====
    "lipa_later.customers_title": "Wateja wa Lipa Baadaye",
    "lipa_later.customers_subtitle": "Wateja {count}",
    "lipa_later.search_placeholder": "Tafuta kwa jina au simu...",
    "lipa_later.clear": "Futa",
    "lipa_later.no_customers": "Hakuna wateja wa Lipa Baadaye walio kwa haraka",
    "lipa_later.no_search_results": "Hapakuna matokeo yanayofanana",
    "lipa_later.view_ageing": "Angalia Uchumba wa Malipo",
    "lipa_later.view_button": "Angalia",
    "lipa_later.overdue_days": "{days} siku bila kulipwa",
    "lipa_later.due_today": "Unapastaka leo",
    
    # ===== LIPA LATER AGEING REPORT SCREEN =====
    "lipa_later.ageing_report_title": "Ripoti ya Uchumba wa Lipa Baadaye",
    "lipa_later.ageing_by_status": "Uchambuzi kwa Hali",
    "lipa_later.current": "Sasa",
    "lipa_later.overdue": "Iliyopita",
    "lipa_later.very_overdue": "Iliyopita sana (>30 siku)",
    
    # ===== SYNC AND CONNECTIVITY =====
    "sync.error_hint": "Sawazisha ilikutana na tatizo. Hali ya offline ni amilifu.",
}

# Placeholder languages pending translation review
PENDING_REVIEW_LANGUAGES = [
    "ki",   # Gĩkũyũ (Kikuyu)
    "kam",  # Kikamba
    "luo",  # Dholuo (Luo)
    "luy",  # Luluhya (Luhya)
    "kln",  # Kalenjin
    "so",   # Af-Soomaali (Somali)
    "ebu",  # Kĩembu (Embu)
    "mer",  # Kĩmĩrũ (Meru)
]

def run():
    """Seed all UI strings into the database"""
    db = SessionLocal()
    
    # Delete all existing UI strings to avoid duplicates
    db.query(UiStringMaster).delete()
    db.commit()
    
    # Seed English strings (source of truth)
    for key, text in STRINGS_EN.items():
        string = UiStringMaster(
            language_code='en',
            string_key=key,
            translated_text=text,
            needs_review=False,
        )
        db.add(string)
    
    # Seed Kiswahili strings (reviewed native translation)
    for key, text in STRINGS_SW.items():
        string = UiStringMaster(
            language_code='sw',
            string_key=key,
            translated_text=text,
            needs_review=False,
        )
        db.add(string)
    
    # Seed pending-review languages with English as placeholder
    for lang_code in PENDING_REVIEW_LANGUAGES:
        for key, text in STRINGS_EN.items():
            string = UiStringMaster(
                language_code=lang_code,
                string_key=key,
                translated_text=text,
                needs_review=True,
            )
            db.add(string)
    
    db.commit()
    print(f"Seeded UI strings for {len(STRINGS_EN)} keys across {2 + len(PENDING_REVIEW_LANGUAGES)} languages.")


if __name__ == "__main__":
    run()