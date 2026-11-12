"""Conversation check: parse → redact → rule signals → sequence → AI review → level → guidance."""

from dataclasses import dataclass

from app.engine import ai_review, guidance, scoring
from app.engine.lexicon import BY_ID, STAGES
from app.engine.parsing import ParsedConversation
from app.engine.signals import Detection, Hit, detect

# Findings the AI may question but not remove, and the lowest level they still allow.
_FLOORS = {"leak_threat": None, "credential_request": "medium", "remote_access_request": "medium"}


@dataclass
class CheckInput:
    parsed: ParsedConversation
    me: str | None
    language: str = "en"
    minor: bool = False
    known_duration: str | None = None
    context: guidance.Context | None = None
    use_ai: bool = True


def run(inp: CheckInput) -> dict:
    detection = detect(inp.parsed, inp.me, inp.known_duration)
    review = ai_review.review(detection, inp.language, inp.minor) if inp.use_ai else ai_review.Review(status="not_requested")

    set_aside = set() if detection.injection_detected else set(review.set_aside)
    floor = "low"
    for signal, minimum in _FLOORS.items():
        if signal in set_aside:
            if minimum is None:
                set_aside.discard(signal)
                review.unclear.add(signal)
            else:
                floor = scoring.higher(floor, minimum)

    hits = [h for h in detection.hits + review.added if h.signal not in set_aside]
    signals = {h.signal for h in hits}
    first: dict[str, int] = {}
    for hit in hits:
        first[hit.signal] = min(first.get(hit.signal, hit.message_index), hit.message_index)

    statuses = [link.status for link in detection.links]
    worst_link = "high_risk" if "high_risk" in statuses else ("suspicious" if "suspicious" in statuses else None)

    ctx = inp.context or guidance.Context()
    ctx.minor = inp.minor
    assessment = scoring.assess(signals, first, minor=inp.minor, worst_link=worst_link, floor=floor)
    advice = guidance.guide(assessment, signals, ctx)

    return {
        "level": assessment.level,
        "headline": advice.headline,
        "reassure": advice.reassure,
        "decisions": [{"pattern": d.pattern, "level": d.level} for d in assessment.decisions],
        "signals": _signals(hits, detection, review),
        "set_aside": [
            {"id": h.signal, "message_index": h.message_index, "excerpt": h.excerpt, "by": by}
            for h, by in [(h, "ai") for h in detection.hits if h.signal in set_aside]
            + [(h, "rules") for h in detection.set_aside]
        ],
        "stages": _stages(hits, detection),
        "escalation": assessment.escalation,
        "timeline": _timeline(hits, detection),
        "links": [
            {
                "url": link.url,
                "host": link.display_host or link.host,
                "status": link.status,
                "signals": [s.id for s in link.signals if s.severity >= 1],
            }
            for link in detection.links
        ],
        "next_steps": advice.steps,
        "resources": advice.resources,
        "ai": {
            "status": review.status,
            "summary": review.summary,
            "reassuring": review.reassuring,
            "limited_by_injection": detection.injection_detected and review.status == "completed",
        },
        "basis": {
            "message_count": len(detection.messages),
            "senders_known": detection.senders_known,
            "format": inp.parsed.format,
            "truncated": inp.parsed.truncated,
            "timestamps": any(m.timestamp for m in detection.messages),
            "injection_detected": detection.injection_detected,
        },
        # For history records only; never includes message text.
        "_record": {
            "signals": sorted(signals),
            "patterns": assessment.patterns,
            "stages": assessment.stages_reached,
            "ai_review": review.status,
        },
    }


def _label(detection: Detection, index: int) -> str:
    if not detection.senders_known:
        return "unknown"
    return "them" if detection.from_them[index] else "you"


def _signals(hits: list[Hit], detection: Detection, review: ai_review.Review) -> list[dict]:
    grouped: dict[str, list[Hit]] = {}
    for hit in hits:
        grouped.setdefault(hit.signal, []).append(hit)
    out = []
    for signal_id, items in grouped.items():
        definition = BY_ID[signal_id]
        items.sort(key=lambda h: h.message_index)
        verdict = None
        if review.status == "completed":
            verdict = "unclear" if signal_id in review.unclear else ("added" if items[0].source == "ai" else "supported")
        out.append(
            {
                "id": signal_id,
                "stage": definition.stage,
                "severity": definition.severity,
                "category": definition.category,
                "ai_verdict": verdict,
                "occurrences": [
                    {
                        "message_index": h.message_index,
                        "excerpt": h.excerpt,
                        "from": _label(detection, h.message_index),
                        "source": h.source,
                    }
                    for h in items[:5]
                ],
                "count": len(items),
            }
        )
    out.sort(key=lambda s: (-s["severity"], s["occurrences"][0]["message_index"]))
    return out


def _stages(hits: list[Hit], detection: Detection) -> list[dict]:
    first: dict[str, Hit] = {}
    for hit in hits:
        stage = BY_ID[hit.signal].stage
        if stage and (stage not in first or hit.message_index < first[stage].message_index):
            first[stage] = hit
    out = []
    for stage in STAGES:
        hit = first.get(stage)
        timestamp = detection.messages[hit.message_index].timestamp if hit else None
        out.append(
            {
                "id": stage,
                "reached": hit is not None,
                "first_message_index": hit.message_index if hit else None,
                "timestamp": timestamp.isoformat() if timestamp else None,
            }
        )
    return out


def _timeline(hits: list[Hit], detection: Detection) -> list[dict]:
    first: dict[str, Hit] = {}
    for hit in hits:
        if hit.signal not in first or hit.message_index < first[hit.signal].message_index:
            first[hit.signal] = hit
    moments = sorted(first.values(), key=lambda h: (h.message_index, -BY_ID[h.signal].severity))
    out = []
    for hit in moments:
        timestamp = detection.messages[hit.message_index].timestamp
        out.append(
            {
                "message_index": hit.message_index,
                "signal": hit.signal,
                "stage": BY_ID[hit.signal].stage,
                "excerpt": hit.excerpt,
                "timestamp": timestamp.isoformat() if timestamp else None,
            }
        )
    return out
