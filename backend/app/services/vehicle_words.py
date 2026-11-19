# backend/app/services/vehicle_words.py
# SMART CABZ: the words a person sees follow their KIND of user.
#   rider    (motorcycle)  Smart Boda  -> text is never changed
#   driver   (car)         Smart Cabz  -> motorcycle / motorbike / bike -> car, rider -> driver, Smart Boda -> Smart Cabz, 🏍️ -> 🚗 (Kiswahili: Bajaji -> Dereva, motosikeli / pikipiki -> gari)
#   business (Smart Bizna) Smart Bizna -> only the brand: Smart Boda -> Smart Bizna
#   chama    (Smart Chama) Smart Chama -> Smart Boda -> Smart Chama, 🏍️ -> 🤝, rider(s) -> member(s)
# Plain functions, no database: the same rules the phone applies (rider-app/src/vehicle/vehicleWords.js).
import re

RIDER, DRIVER, BUSINESS, CHAMA = "rider", "driver", "business", "chama"
NOT_APPLICABLE = "n/a"          # SMART BIZNA FIX: the vehicle type of a person who owns no vehicle: a business user, a Smart Chama member


def vehicle_type_for(vehicle_type, is_business=False, chama_only=False) -> str:
    """What `rider.vehicle_type` should read for this person: a business user or a Smart Chama member never owns a motorcycle or a car."""
    return NOT_APPLICABLE if (is_business or chama_only) else (vehicle_type or "motorcycle")


def audience_for(vehicle_type, is_business=False, chama_only=False) -> str:
    if is_business:
        return BUSINESS
    if chama_only:
        return CHAMA
    return DRIVER if vehicle_type == "car" else RIDER


def _case(word: str, repl: str) -> str:
    """Keep the capital letters of the word that was replaced (car / Car / CAR)."""
    if word.isupper() and len(word) > 1:
        return repl.upper()
    if word[:1].isupper():
        return repl[:1].upper() + repl[1:]
    return repl


def _sub(pattern, repl_one, repl_many=None):
    rx = re.compile(pattern, re.IGNORECASE)

    def fn(m):
        w = m.group(0)
        many = repl_many is not None and w.lower().endswith("s") and not w.lower().endswith(("ss",))
        return _case(w, repl_many if many else repl_one)
    return rx, fn


_DRIVER_RULES = [
    (re.compile(r"Smart Boda"), lambda m: "Smart Cabz"),
    (re.compile("\U0001F3CD\uFE0F?"), lambda m: "\U0001F697"),
    _sub(r"\bmotor ?bikes?\b|\bmotorcycles?\b|\bbikes?\b", "car", "cars"),
    _sub(r"\briders?\b", "driver", "drivers"),
    _sub(r"\bbajaji\b", "dereva"),
    _sub(r"\bmotosikeli\b|\bpikipiki\b", "gari"),
]
_BUSINESS_RULES = [(re.compile(r"Smart Boda"), lambda m: "Smart Bizna")]
_CHAMA_RULES = [
    (re.compile(r"Smart Boda"), lambda m: "Smart Chama"),
    (re.compile("\U0001F3CD\uFE0F?"), lambda m: "\U0001F91D"),
    _sub(r"\briders?\b", "member", "members"),
]


def convert(text, audience: str):
    """The text as this kind of user should read it. Anything that is not a string, and every rider's text, comes back untouched."""
    if not isinstance(text, str) or not text or audience == RIDER:
        return text
    rules = _DRIVER_RULES if audience == DRIVER else _BUSINESS_RULES if audience == BUSINESS else _CHAMA_RULES if audience == CHAMA else []
    for rx, fn in rules:
        text = rx.sub(fn, text)
    return text


def convert_detail(detail, audience: str):
    """An HTTP error `detail` is a string, a list of validation errors, or a small dict with a code: only the readable strings are converted."""
    if isinstance(detail, str):
        return convert(detail, audience)
    if isinstance(detail, dict):
        return {k: (convert(v, audience) if k in ("message", "msg") else v) for k, v in detail.items()}
    if isinstance(detail, list):
        return [convert_detail(d, audience) for d in detail]
    return detail
