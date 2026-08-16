# backend/tests/test_i18n_completeness.py
from app.models.master_data import LanguageMaster, UiStringMaster

def test_every_active_language_has_every_key(db_session):
    all_keys = {r.string_key for r in db_session.query(UiStringMaster).filter_by(language_code="en").all()}
    languages = db_session.query(LanguageMaster).filter_by(is_active=True).all()
    for lang in languages:
        keys_for_lang = {r.string_key for r in db_session.query(UiStringMaster).filter_by(language_code=lang.code).all()}
        missing = all_keys - keys_for_lang
        assert not missing, f"{lang.code} is missing keys: {missing}"  # structural completeness — Step 7b

def test_no_unreviewed_strings_in_a_release_candidate(db_session):
    # Run this check specifically before marking a language "production ready" in the
    # Super Admin console (Step 7b.7) — it is expected to fail for newly-added languages.
    unreviewed = db_session.query(UiStringMaster).filter_by(needs_review=True).count()
    assert unreviewed == 0, f"{unreviewed} strings still need native-speaker review"
