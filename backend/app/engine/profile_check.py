"""Fake profile / identity check.

SAHELI cannot verify anyone's identity. This turns what the person knows about a profile
into signals that may warrant further verification, and suggests ways to verify.
"""

from dataclasses import dataclass, field

PERSONA_CLAIMS = {"military_abroad", "oil_rig_or_ship", "doctor_abroad", "widowed", "wealthy_investor", "model_or_celebrity"}
ASKS = {"money", "gift_cards", "crypto", "intimate_images", "personal_details", "move_apps", "secrecy", "investment"}


@dataclass
class ProfileAnswers:
    account_age: str = "unknown"  # new | months | years | unknown
    photo_count: str = "unknown"  # none | few | many | unknown
    connections: str = "unknown"  # few | some | many | unknown
    mutual_connections: str = "unknown"  # yes | no | unknown
    video_call: str = "not_asked"  # yes | refused | not_asked
    met_in_person: bool = False
    photos_look_professional: bool = False
    story_inconsistent: bool = False
    reverse_image: str = "not_checked"  # different_name | same_name | nothing_found | not_checked
    claims: list[str] = field(default_factory=list)
    asked_for: list[str] = field(default_factory=list)


def check(a: ProfileAnswers) -> dict:
    signals: list[tuple[str, int]] = []

    if a.reverse_image == "different_name":
        signals.append(("photos_used_elsewhere", 3))
    if a.video_call == "refused":
        signals.append(("refuses_video_call", 2))
    if a.story_inconsistent:
        signals.append(("story_inconsistent", 2))
    for claim in sorted(set(a.claims) & PERSONA_CLAIMS):
        signals.append((f"claim_{claim}", 1))
    if a.account_age == "new":
        signals.append(("new_account", 1))
    if a.photo_count in {"none", "few"}:
        signals.append(("few_photos", 1))
    if a.connections == "few":
        signals.append(("few_connections", 1))
    if a.mutual_connections == "no":
        signals.append(("no_mutual_connections", 1))
    if a.photos_look_professional:
        signals.append(("professional_photos", 1))
    asks = set(a.asked_for) & ASKS
    for ask in sorted(asks & {"money", "gift_cards", "crypto", "investment", "intimate_images"}):
        signals.append((f"asked_{ask}", 3))
    if "secrecy" in asks:
        signals.append(("asked_secrecy", 2))
    for ask in sorted(asks & {"personal_details", "move_apps"}):
        signals.append((f"asked_{ask}", 1))

    reassuring = []
    if a.met_in_person:
        reassuring.append("met_in_person")
    if a.video_call == "yes":
        reassuring.append("video_called")
    if a.reverse_image in {"nothing_found", "same_name"}:
        reassuring.append("reverse_image_clean")

    identity_signals = [s for s in signals if not s[0].startswith("asked_")]
    if reassuring and identity_signals:
        # Having met or video called makes profile-level doubts much less important.
        signals = [s if s[0].startswith("asked_") or s[1] >= 3 else (s[0], max(0, s[1] - 1)) for s in signals]

    total = sum(weight for _, weight in signals)
    strong = sum(1 for _, weight in signals if weight >= 3)
    if strong >= 2 or (strong and total >= 5):
        level = "high"
    elif strong or total >= 3:
        level = "medium"
    else:
        level = "low"

    steps = []
    if a.video_call != "yes" and not a.met_in_person:
        steps.append("ask_live_video")
    if a.reverse_image == "not_checked":
        steps.append("reverse_image_search")
    steps.append("search_name_and_photos")
    if a.mutual_connections != "yes":
        steps.append("check_mutual_connections")
    if asks & {"money", "gift_cards", "crypto", "investment"}:
        steps.append("no_money")
    if "intimate_images" in asks:
        steps.append("no_intimate_images")
    steps.append("talk_to_someone")

    return {
        "level": level,
        "signals": [{"id": sid, "weight": w} for sid, w in sorted(signals, key=lambda s: -s[1]) if w > 0],
        "reassuring": reassuring,
        "steps": steps,
    }
