# backend/app/services/group_kinds.py
# SMART CABZ: who may be in which kind of group. Plain functions, no database, so the rules can be tested alone.
#   Group Members Type   riders | business | drivers | mixed
#   Person kind          rider (motorcycle) | driver (car) | business (a Smart Bizna user) | chama (SMART CHAMA: in the app only for a group)
#   Riders   -> only motorcycle riders         Drivers -> only car drivers
#   Business -> only existing business users   Mixed   -> any of the four
#   A brand-new number added to a Mixed group becomes a Chama member (SMART CHAMA); a rider, driver or business user who is added keeps what they are.
MEMBERS_TYPES = ("riders", "business", "drivers", "mixed")
KINDS = ("rider", "driver", "business", "chama")
ALLOWED = {"riders": {"rider"}, "drivers": {"driver"}, "business": {"business"}, "mixed": {"rider", "driver", "business", "chama"}}
KIND_WORDS = {"rider": "a motorcycle rider", "driver": "a car driver", "business": "a Smart Bizna business user", "chama": "a Smart Chama member"}
GROUP_WORDS = {"riders": "motorcycle riders", "drivers": "car drivers", "business": "business users", "mixed": "riders, drivers, business users and Smart Chama members"}


def kind_of(vehicle_type, is_business=False, chama_only=False) -> str:
    return "business" if is_business else "chama" if chama_only else "driver" if vehicle_type == "car" else "rider"


def vehicle_of(kind) -> str:
    """The vehicle type a kind gives the account. SMART BIZNA FIX: a business user and a Smart Chama member own no vehicle, so theirs is 'n/a'
    (it used to be the column default, 'motorcycle', which made them look like riders)."""
    return "car" if kind == "driver" else "n/a" if kind in ("business", "chama") else "motorcycle"


def allowed(members_type, kind) -> bool:
    return kind in ALLOWED.get(members_type or "riders", ALLOWED["riders"])


def refusal(members_type, kind) -> str:
    return f"This is a group for {GROUP_WORDS.get(members_type, 'motorcycle riders')}. This number belongs to {KIND_WORDS.get(kind, 'someone else')}."


def kind_for_new_number(members_type, chosen=None):
    """What a brand-new number (no account, no record anywhere) becomes when a Treasurer adds it, or None when it cannot be added.
    Riders -> rider, Drivers -> driver. Mixed -> a Chama member (SMART CHAMA: the Treasurer is no longer asked rider or driver; a rider or
    driver is created by the Administrator). Business -> never: a business user only comes from the Administrator's Register a Business.
    A Mixed choice of business is refused for the same reason."""
    if members_type == "riders":
        return "rider"
    if members_type == "drivers":
        return "driver"
    if members_type == "mixed" and chosen != "business":
        return "chama"
    return None


def new_number_refusal(members_type, chosen=None) -> str:
    if members_type == "business" or (members_type == "mixed" and chosen == "business"):
        return "This number is not a registered Smart Bizna business user. Ask the Administrator to register this person's business first."
    return "This number cannot be added to this group."


def treasurer_kind_for(members_type, chosen=None):
    """The Treasurer's kind: fixed by the group type, or (Mixed) the one the Administrator chose. None = a choice is still missing."""
    if members_type == "riders":
        return "rider"
    if members_type == "drivers":
        return "driver"
    if members_type == "business":
        return "business"
    return chosen if chosen in KINDS else None


def can_change_members_type(members_besides_treasurer: int) -> bool:
    """A group's Members Type is fixed as soon as it has any member besides its Treasurer."""
    return members_besides_treasurer == 0


def pair_matches(a_members_type, a_treasurer_kind, b_members_type, b_treasurer_kind) -> bool:
    """The two groups of one Treasurer (Merry-Go-Round + Table Banking) must have the same Members Type and Treasurer kind."""
    return a_members_type == b_members_type and a_treasurer_kind == b_treasurer_kind
