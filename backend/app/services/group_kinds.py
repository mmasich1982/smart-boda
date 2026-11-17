# backend/app/services/group_kinds.py
# SMART CABZ: who may be in which kind of group. Plain functions, no database, so the rules can be tested alone.
#   Group Members Type   riders | business | drivers | mixed
#   Person kind          rider (motorcycle) | driver (car) | business (a Smart Bizna user)
#   Riders   -> only motorcycle riders         Drivers -> only car drivers
#   Business -> only existing business users   Mixed   -> any of the three
MEMBERS_TYPES = ("riders", "business", "drivers", "mixed")
KINDS = ("rider", "driver", "business")
ALLOWED = {"riders": {"rider"}, "drivers": {"driver"}, "business": {"business"}, "mixed": {"rider", "driver", "business"}}
KIND_WORDS = {"rider": "a motorcycle rider", "driver": "a car driver", "business": "a Smart Bizna business user"}
GROUP_WORDS = {"riders": "motorcycle riders", "drivers": "car drivers", "business": "business users", "mixed": "riders, drivers and business users"}


def kind_of(vehicle_type, is_business=False) -> str:
    return "business" if is_business else "driver" if vehicle_type == "car" else "rider"


def vehicle_of(kind) -> str:
    """The vehicle type a rider-or-driver kind gives the account (a business user has none: the default stays)."""
    return "car" if kind == "driver" else "motorcycle"


def allowed(members_type, kind) -> bool:
    return kind in ALLOWED.get(members_type or "riders", ALLOWED["riders"])


def refusal(members_type, kind) -> str:
    return f"This is a group for {GROUP_WORDS.get(members_type, 'motorcycle riders')}. This number belongs to {KIND_WORDS.get(kind, 'someone else')}."


def kind_for_new_number(members_type, chosen=None):
    """What a brand-new number (no account, no record anywhere) becomes when a Treasurer adds it, or None when it cannot be added.
    Riders -> rider, Drivers -> driver. Mixed -> the kind the Treasurer chose (rider or driver). Business -> never: a business user only comes
    from the Administrator's Register a Business. A Mixed choice of business is refused for the same reason."""
    if members_type == "riders":
        return "rider"
    if members_type == "drivers":
        return "driver"
    if members_type == "mixed" and chosen in ("rider", "driver"):
        return chosen
    return None


def new_number_refusal(members_type, chosen=None) -> str:
    if members_type == "business" or (members_type == "mixed" and chosen == "business"):
        return "This number is not a registered Smart Bizna business user. Ask the Administrator to register this person's business first."
    if members_type == "mixed":
        return "Choose the member type: motorcycle rider or car driver."
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
