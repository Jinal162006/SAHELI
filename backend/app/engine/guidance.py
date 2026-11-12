"""Choose next steps and support resources for a conversation check.

Returns identifiers; the wording lives in the frontend translation files so that every
language says the same thing.
"""

from dataclasses import dataclass, field

from app.engine.scoring import Assessment

# Order in which steps are shown when several apply. Most urgent first.
STEP_ORDER = [
    "danger_call_112",
    "contact_bank_now",
    "call_1930",
    "dont_pay_blackmail",
    "hang_up_authority",
    "no_codes",
    "no_money",
    "dont_click_link",
    "tell_trusted_adult",
    "stop_replying_keep_chat",
    "say_no_is_ok",
    "no_means_no",
    "their_safety_not_your_job",
    "save_evidence",
    "image_removal",
    "verify_identity",
    "reverse_image_search",
    "check_with_official_source",
    "pause_before_replying",
    "talk_to_someone",
    "meet_safely",
    "report_and_block",
    "report_chakshu",
    "file_complaint",
    "trust_your_instincts",
]

_REASSURING = {"sextortion", "child_sexual_exploitation", "grooming", "intimate_pressure", "threat_of_harm", "authority_scam"}
_HEADLINE_PATTERNS = [
    "sextortion",
    "child_sexual_exploitation",
    "threat_of_harm",
    "authority_scam",
    "credential_theft",
    "grooming",
]


@dataclass
class Context:
    """What the user told us has already happened. All optional."""

    sent_money: bool = False
    shared_images: bool = False
    shared_codes: bool = False
    planning_to_meet: bool = False
    minor: bool = False


@dataclass
class Guidance:
    headline: str
    reassure: bool
    steps: list[str] = field(default_factory=list)
    resources: list[str] = field(default_factory=list)


def guide(assessment: Assessment, signals: set[str], ctx: Context) -> Guidance:
    patterns = set(assessment.patterns)
    steps: set[str] = set()
    resources: list[str] = []

    def add_resources(*ids: str) -> None:
        for rid in ids:
            if rid not in resources:
                resources.append(rid)

    financial = patterns & {"romance_money", "money_pressure", "investment_scam", "investment_pitch", "prize_or_loan_fee"}
    if "sextortion" in patterns:
        steps |= {
            "dont_pay_blackmail",
            "stop_replying_keep_chat",
            "save_evidence",
            "image_removal",
            "report_and_block",
            "file_complaint",
        }
        add_resources("takeitdown" if ctx.minor else "stopncii", "cybercrime_portal")
    if patterns & {"child_sexual_exploitation", "grooming"}:
        steps |= {"tell_trusted_adult", "stop_replying_keep_chat", "save_evidence", "report_and_block", "file_complaint"}
        if ctx.shared_images:
            steps.add("image_removal")
        add_resources("childline_1098", "cybercrime_portal", "takeitdown")
    if "threat_of_harm" in patterns:
        steps |= {"danger_call_112", "save_evidence", "talk_to_someone", "file_complaint"}
        add_resources("emergency_112", "women_helpline_181", "cybercrime_portal")
    if "credential_theft" in patterns:
        steps |= {"no_codes", "report_and_block", "report_chakshu"}
        if ctx.shared_codes:
            steps |= {"contact_bank_now", "call_1930"}
        add_resources("cyber_1930", "chakshu")
    if patterns & {"authority_scam", "authority_claim"}:
        steps |= {"hang_up_authority", "no_money", "report_chakshu"}
        add_resources("cyber_1930", "chakshu")
    if financial:
        steps |= {"no_money", "talk_to_someone", "save_evidence"}
        if "romance_money" in patterns:
            steps |= {"verify_identity", "reverse_image_search"}
        if patterns & {"investment_scam", "investment_pitch", "prize_or_loan_fee"}:
            steps.add("check_with_official_source")
        add_resources("cyber_1930", "cybercrime_portal")
    if patterns & {"intimate_pressure", "intimate_request"}:
        steps |= {"say_no_is_ok", "save_evidence"} if "intimate_pressure" in patterns else {"say_no_is_ok"}
        if ctx.shared_images:
            steps.add("image_removal")
            add_resources("takeitdown" if ctx.minor else "stopncii")
    if patterns & {"controlling_behaviour", "isolation"}:
        steps |= {"talk_to_someone", "save_evidence"}
    if "self_harm_pressure" in patterns:
        steps |= {"their_safety_not_your_job", "talk_to_someone"}
        add_resources("tele_manas")
    if patterns & {"phishing", "account_scare", "dangerous_link"}:
        steps |= {"dont_click_link", "check_with_official_source"}
        if "phishing" in patterns:
            steps.add("no_codes")
        add_resources("chakshu")
    if "unverified_romance" in patterns:
        steps |= {"verify_identity", "reverse_image_search", "pause_before_replying"}
    if "pressure_after_no" in patterns:
        steps.add("no_means_no")
    if "escalation" in patterns:
        steps |= {"pause_before_replying", "talk_to_someone"}

    if ctx.sent_money and (financial or patterns & {"authority_scam", "credential_theft", "phishing", "sextortion"}):
        steps |= {"call_1930", "contact_bank_now"}
        add_resources("cyber_1930")
    if ctx.planning_to_meet and assessment.level != "low":
        steps.add("meet_safely")
    if assessment.level in {"high", "critical"}:
        steps.add("save_evidence")
        steps.add("tell_trusted_adult" if ctx.minor else "talk_to_someone")
    if assessment.level == "critical":
        add_resources("emergency_112")
    if ctx.minor:
        steps.discard("talk_to_someone")
        if assessment.level != "low":
            steps.add("tell_trusted_adult")
    if assessment.level == "low":
        steps.add("trust_your_instincts")

    ordered = [s for s in STEP_ORDER if s in steps][:7]
    headline = next((p for p in _HEADLINE_PATTERNS if p in patterns), f"level_{assessment.level}")
    return Guidance(
        headline=headline,
        reassure=bool(patterns & _REASSURING) or (ctx.minor and assessment.level != "low"),
        steps=ordered,
        resources=resources[:4],
    )
