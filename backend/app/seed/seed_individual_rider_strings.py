# backend/app/seed/seed_individual_rider_strings.py
# Wording for Setup My Profile now that a rider can also be pre-registered by Smart Boda as an INDIVIDUAL rider (no Treasurer,
# no group). Run it AFTER seed_ui_strings (seed_all_data.py does this for you). It only ADDS or UPDATES the keys below, so it is
# safe to run any number of times and it never deletes other strings.
#   cd backend && python -m app.seed.seed_individual_rider_strings
# Three keys already exist (setup.subtitle, setup.mobile_not_found, setup.trust_note) and are reworded to cover both ways of being
# registered; setup.name_hint_individual is new. The Kiswahili is a first draft: have a native speaker review it.
from app.database import SessionLocal
from app.models.master_data import UiStringMaster

try:
    from app.seed.seed_ui_strings import PENDING_REVIEW_LANGUAGES
except Exception:          # pragma: no cover
    PENDING_REVIEW_LANGUAGES = []

STRINGS_EN = {
    "setup.subtitle": "Enter the mobile number registered for you by your Group Treasurer or by Smart Boda. We find your name, you choose your fuel type, and you are set.",
    "setup.mobile_not_found": "We could not find this number. Ask your Group Treasurer to register you, or contact Smart Boda to be added as an individual rider, then try again.",
    "setup.name_hint_individual": "This is the name Smart Boda registered for you.",
    "setup.trust_note": "Your name comes from your Treasurer or from Smart Boda. Your details are kept private on your phone and our secure servers.",
}

STRINGS_SW = {
    "setup.subtitle": "Weka namba ya simu uliyosajiliwa nayo na Mweka Hazina wa kikundi chako au na Smart Boda. Tunapata jina lako, unachagua aina ya nishati, na umemaliza.",
    "setup.mobile_not_found": "Hatukupata namba hii. Mwombe Mweka Hazina wa kikundi chako akusajili, au wasiliana na Smart Boda ili uongezwe kama mwendeshaji binafsi, kisha ujaribu tena.",
    "setup.name_hint_individual": "Hili ni jina ambalo Smart Boda ilikusajili nalo.",
    "setup.trust_note": "Jina lako linatoka kwa Mweka Hazina wako au kwa Smart Boda. Maelezo yako yanahifadhiwa kwa siri kwenye simu yako na seva zetu salama.",
}


def _upsert(db, lang, key, text, needs_review):
    row = db.query(UiStringMaster).filter_by(language_code=lang, string_key=key).first()
    if row:
        row.translated_text, row.needs_review = text, needs_review
    else:
        db.add(UiStringMaster(language_code=lang, string_key=key, translated_text=text, needs_review=needs_review))


def run():
    db = SessionLocal()
    try:
        for key, text in STRINGS_EN.items():
            _upsert(db, "en", key, text, False)
        for key, text in STRINGS_SW.items():
            _upsert(db, "sw", key, text, True)
        for lang in PENDING_REVIEW_LANGUAGES:            # other languages show English until translated
            for key, text in STRINGS_EN.items():
                _upsert(db, lang, key, text, True)
        db.commit()
        print(f"Individual rider strings seeded: {len(STRINGS_EN)} keys.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
