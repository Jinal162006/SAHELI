"""Turn warning signs into a risk level, with the reasons that decided it.

The level is never a sum of arbitrary points. It is the highest of:
- named patterns (combinations of signs known from real scams and abuse),
- a base level from the signs on their own,
- an escalation check (several stages reached, in roughly the usual order).

One sign on its own never produces High or Critical, except signs that are harmful
whatever the context: threats, blackmail, and requests for OTPs, PINs or remote access.
Full rules are documented in docs/RISK_SCORING.md.
"""

from dataclasses import dataclass, field

from app.engine.lexicon import BY_ID, STAGES

LEVELS = ["low", "medium", "high", "critical"]


def higher(a: str, b: str) -> str:
    return a if LEVELS.index(a) >= LEVELS.index(b) else b


@dataclass
class Decision:
    pattern: str
    level: str


@dataclass
class Assessment:
    level: str
    decisions: list[Decision] = field(default_factory=list)
    stages_reached: list[str] = field(default_factory=list)
    escalation: bool = False

    @property
    def patterns(self) -> list[str]:
        return [d.pattern for d in self.decisions]


def assess(
    signals: set[str],
    first_index: dict[str, int],
    *,
    minor: bool = False,
    worst_link: str | None = None,
    floor: str = "low",
) -> Assessment:
    s = signals

    def has(*ids: str) -> bool:
        return any(i in s for i in ids)

    decisions: list[Decision] = []

    def fire(pattern: str, level: str) -> None:
        decisions.append(Decision(pattern, level))

    romance = has("love_bombing", "rapid_intensity", "guilt_pressure", "emotional_manipulation")
    money_ask = has("money_request", "gift_card_crypto")

    if has("leak_threat"):
        fire("sextortion", "critical")
    if has("threat_harm"):
        fire("threat_of_harm", "critical" if has("personal_info_request", "alone_check") else "high")
    if has("credential_request", "remote_access_request"):
        severe = has("urgency_pressure", "account_threat", "authority_impersonation")
        fire("credential_theft", "critical" if severe else "high")
    if has("authority_impersonation"):
        coercive = has(
            "money_request",
            "credential_request",
            "secrecy_request",
            "urgency_pressure",
            "threat_harm",
            "leak_threat",
            "payment_details_shared",
            "remote_access_request",
        )
        fire("authority_scam" if coercive else "authority_claim", "critical" if coercive else "medium")
    if romance and has("money_request", "gift_card_crypto", "investment_pitch"):
        fire("romance_money", "high")
    if money_ask and has("urgency_pressure"):
        fire("money_pressure", "high")
    if has("investment_pitch"):
        backed = has("money_request", "payment_details_shared", "gift_card_crypto", "urgency_pressure", "suspicious_link")
        fire("investment_scam" if backed else "investment_pitch", "high" if backed else "medium")

    grooming_signs = s & {
        "mature_for_age",
        "alone_check",
        "secrecy_request",
        "isolation_attempt",
        "gift_offer",
        "age_probe",
        "intimate_request",
        "sexual_talk",
        "personal_info_request",
    }
    grooming_core = s & {"secrecy_request", "isolation_attempt", "alone_check", "intimate_request", "mature_for_age"}
    youth_context = minor or has("age_probe", "mature_for_age")
    if (
        minor
        and has("intimate_request")
        or minor
        and has("sexual_talk")
        and has("secrecy_request", "alone_check", "isolation_attempt")
    ):
        fire("child_sexual_exploitation", "critical")
    elif youth_context and len(grooming_signs) >= 3 and grooming_core or minor and has("sexual_talk"):
        fire("grooming", "high")

    if has("intimate_request") and not minor:
        pressured = has("repeated_pressure", "guilt_pressure", "secrecy_request", "emotional_manipulation")
        fire("intimate_pressure" if pressured else "intimate_request", "high" if pressured else "medium")
    if has("isolation_attempt"):
        controlling = has("secrecy_request", "guilt_pressure", "threat_harm", "self_harm_manipulation")
        fire("controlling_behaviour" if controlling else "isolation", "high" if controlling else "medium")
    if has("self_harm_manipulation"):
        fire("self_harm_pressure", "high")
    if has("account_threat"):
        backed = has("suspicious_link", "credential_request", "personal_info_request", "money_request", "payment_details_shared")
        fire("phishing" if backed else "account_scare", "high" if backed else "medium")
    if has("suspicious_link"):
        fire("dangerous_link", "high" if worst_link == "high_risk" else "medium")
    if has("prize_lure", "loan_offer") and has(
        "money_request", "payment_details_shared", "suspicious_link", "credential_request"
    ):
        fire("prize_or_loan_fee", "high")
    identity_doubt = has("claimed_persona", "video_call_avoidance", "identity_inconsistency")
    if identity_doubt and romance and has("move_off_platform", "secrecy_request", "gift_offer"):
        fire("unverified_romance", "medium")
    if has("repeated_pressure"):
        fire("pressure_after_no", "medium")

    # Base level from the signs on their own.
    distinct = [BY_ID[i] for i in s if i in BY_ID]
    base = "low"
    if len(distinct) == 1 and distinct[0].severity >= 3 or len(distinct) > 1 and sum(d.severity for d in distinct) >= 6:
        base = "medium"

    # Escalation: how many stages appear, and whether they appear in the usual order.
    staged = sorted(
        ((first_index[d.id], STAGES.index(d.stage)) for d in distinct if d.stage and d.id in first_index),
        key=lambda pair: pair[0],
    )
    stage_order: list[int] = []
    for _, stage in staged:
        if stage not in stage_order:
            stage_order.append(stage)
    reached = [STAGES[i] for i in sorted(stage_order)]
    pairs = [(a, b) for i, a in enumerate(stage_order) for b in stage_order[i + 1 :]]
    in_order = sum(1 for a, b in pairs if b > a) / len(pairs) if pairs else 0
    escalation = len(stage_order) >= 4 and in_order >= 0.7
    if escalation:
        fire("escalation", "high" if len(stage_order) >= 6 else _bump(base))

    level = base
    for decision in decisions:
        level = higher(level, decision.level)
    level = higher(level, floor)
    decisions.sort(key=lambda d: -LEVELS.index(d.level))
    return Assessment(level=level, decisions=decisions, stages_reached=reached, escalation=escalation)


def _bump(level: str) -> str:
    return LEVELS[min(LEVELS.index(level) + 1, LEVELS.index("high"))]
