# backend/app/seed/seed_smart_bizna.py
# SMART BIZNA onboarding data. Run it AFTER seed_ui_strings (seed_all_data.py does this for you); it is safe to run any number of
# times and never deletes anything:   cd backend && python -m app.seed.seed_smart_bizna
#   1. Business Type list (master data, like fuel types). Only MISSING types are added, so a name or an "inactive" switch
#      an Administrator changes later is never overwritten.
#   2. Onboarding wording for the three first screens: the first two screens are brand-less and business-friendly, and
#      Setup My Profile now serves riders (fuel type) and business users (business type). Existing keys are UPDATED, new keys
#      are ADDED. The Kiswahili is a first draft: have a native speaker review it (it is flagged needs_review).
from app.database import SessionLocal
from app.models.business import BusinessTypeMaster
from app.models.master_data import UiStringMaster

try:
    from app.seed.seed_ui_strings import PENDING_REVIEW_LANGUAGES
except Exception:          # pragma: no cover
    PENDING_REVIEW_LANGUAGES = []

# The same 25 business types, codes, names and order as 001_business_onboarding.sql (sort_order = position, 1..25).
BUSINESS_TYPES = [
    ("kiosk", "Kiosk"),
    ("grocery", "Grocery"),
    ("salon_barber", "Salon/Barber"),
    ("beauty_cosmetics", "Beauty/Cosmetics"),
    ("butchery", "Butchery"),
    ("pharmacy_chemist", "Pharmacy/Chemist"),
    ("hardware", "Hardware"),
    ("hotel_Bar", "Hotel/Cafe/Bar"),
    ("refill", "Water/Oil/Milk Refill"),
    ("second_hand", "Second Hand Items"),
    ("electronics", "Electronics/Repairs"),
    ("laundry", "Laundry"),
    ("wines_spirits", "Wines/Spirits"),
    ("petrol_station", "Petrol Station"),
    ("tailoring", "Tailoring"),
    ("bookshop_stationeries", "Bookshop/Stationeries"),
    ("carwash", "Carwash"),
    ("spare_parts", "Spare Parts"),
    ("gas_charcoal", "Gas/Charcoal"),
    ("motorcycle_car_repairs", "Motorcycle/Car Repairs"),
    ("boutique", "Clothes/Shoes/Perfumes"),
    ("malimali", "Mali Mali"),
    ("furniture_metal", "Furniture/Metal Items"),
    ("scrape", "Scrape"),
    ("building_items", "Building Items"),
]

STRINGS_EN = {
    "preview.subtitle": "This is what business owners see every month, once you're set up.",
    "preview.cost_label": "Running expenses",
    "preview.hint": "We work out these numbers for you, from your sales. No pen. No paper. No guessing.",
    "preview.cta": "Set Up My Business Now \u2192",
    "preview.fallback": "Track your daily sales, costs, and profit \u2014 automatically.",
    "preview.tick1": "See how much you really made \u2014 every single day.",
    "preview.tick2": "Know your true profit after expenses.",
    "preview.tick3": "Works even when you have no internet.",
    "preview.trust_note": "Just two quick questions about your business, and this is yours. We only ask what we truly need \u2014 your information is never shared without your say-so.",
    "setup.subtitle": "Enter the mobile number your Admin or Group Treasurer registered. We find your name, you complete one choice, and you are set.",
    "setup.mobile_not_found": "We could not find this number. Ask your Admin or your Group Treasurer to register you, then try again.",
    "setup.name_hint_admin": "This is the name your Admin registered.",
    "setup.business_type_label": "Business Type",
    "setup.business_type_required": "Please select your business type.",
    "setup.trust_note": "Your name comes from your Admin or Group Treasurer registration. Your details are kept private on your phone and our secure servers.",
}

STRINGS_SW = {
    "preview.subtitle": "Hiki ndicho wamiliki wa biashara wanachokiona kila mwezi, ukishakamilisha usajili.",
    "preview.cost_label": "Gharama za kuendesha biashara",
    "preview.hint": "Tunakukokotolea namba hizi, kutoka kwa mauzo yako. Hakuna kalamu. Hakuna karatasi. Hakuna kukisia.",
    "preview.cta": "Weka Biashara Yangu Sasa \u2192",
    "preview.fallback": "Fuatilia mauzo, gharama na faida yako ya kila siku \u2014 kiotomatiki.",
    "preview.tick1": "Ona kiasi ulichopata kweli \u2014 kila siku.",
    "preview.tick2": "Jua faida yako halisi baada ya gharama.",
    "preview.tick3": "Inafanya kazi hata bila intaneti.",
    "preview.trust_note": "Maswali mawili tu kuhusu biashara yako, na ni yako. Tunauliza tu tunachohitaji kweli \u2014 taarifa zako hazishirikiwi bila ridhaa yako.",
    "setup.subtitle": "Weka namba ya simu ambayo Msimamizi wako au Mweka Hazina wa kikundi alikusajili nayo. Tunapata jina lako, unafanya chaguo moja, na umemaliza.",
    "setup.mobile_not_found": "Hatukupata namba hii. Mwombe Msimamizi wako au Mweka Hazina wa kikundi akusajili, kisha ujaribu tena.",
    "setup.name_hint_admin": "Hili ni jina alilokusajili nalo Msimamizi wako.",
    "setup.business_type_label": "Aina ya Biashara",
    "setup.business_type_required": "Tafadhali chagua aina ya biashara yako.",
    "setup.trust_note": "Jina lako linatoka kwa usajili wa Msimamizi wako au Mweka Hazina wa kikundi. Maelezo yako yanahifadhiwa kwa siri kwenye simu yako na seva zetu salama.",
}


def _upsert(db, lang, key, text, needs_review):
    row = db.query(UiStringMaster).filter_by(language_code=lang, string_key=key).first()
    if row:
        row.translated_text, row.needs_review = text, needs_review
    else:
        db.add(UiStringMaster(language_code=lang, string_key=key, translated_text=text, needs_review=needs_review))


def seed_business_types(db):
    have = {c for (c,) in db.query(BusinessTypeMaster.code).all()}
    for i, (code, name) in enumerate(BUSINESS_TYPES, start=1):
        if code not in have:
            db.add(BusinessTypeMaster(code=code, display_name=name, is_active=True, sort_order=i))


def run():
    db = SessionLocal()
    try:
        seed_business_types(db)
        for key, text in STRINGS_EN.items():
            _upsert(db, "en", key, text, False)
        for key, text in STRINGS_SW.items():
            _upsert(db, "sw", key, text, True)
        for lang in PENDING_REVIEW_LANGUAGES:            # other languages show English until translated
            for key, text in STRINGS_EN.items():
                _upsert(db, lang, key, text, True)
        db.commit()
        print(f"Smart Bizna seeded: {len(BUSINESS_TYPES)} business types, {len(STRINGS_EN)} string keys.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
