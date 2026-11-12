"""API behaviour, authorisation boundaries and privacy guarantees."""

import io
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select, text

from app.api.common import now
from app.api.meetings import escalate_missed
from app.config import get_settings
from app.db import SessionLocal, engine
from app.main import app
from app.models import Check, EmergencyEvent, EvidenceFile, EvidenceItem, SafeMeeting
from tests.helpers import auth, jpeg_with_gps, plain_png

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_database():
    with engine.begin() as conn:
        tables = (
            conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'saheli' AND tablename <> 'alembic_version'"))
            .scalars()
            .all()
        )
        conn.execute(text("TRUNCATE " + ", ".join(f'saheli."{t}"' for t in tables) + " CASCADE"))
    yield


def new_user(**profile) -> tuple[uuid.UUID, dict]:
    uid = uuid.uuid4()
    headers = auth(uid, email=f"{uid.hex[:8]}@example.com")
    if profile:
        assert client.patch("/api/me", json=profile, headers=headers).status_code == 200
    return uid, headers


# Basics -----------------------------------------------------------------------------------


def test_health_config_and_resources():
    assert client.get("/api/health").json() == {"status": "ok"}
    config = client.get("/api/config").json()
    assert config["features"] == {"ai": False, "email_alerts": False, "threat_lookup": False}
    assert "supabase_service_key" not in str(config)
    resources = client.get("/api/resources").json()
    assert any(r["id"] == "cyber_1930" and r["phone"] == "1930" for r in resources["resources"])


def test_security_headers_and_unknown_api():
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


# Authentication ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/api/me", "/api/evidence", "/api/contacts", "/api/incidents", "/api/checks", "/api/notifications"]
)
def test_protected_endpoints_need_a_session(path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthorised"


@pytest.mark.parametrize(
    "overrides",
    [
        {"iss": "https://someone-else.supabase.co/auth/v1"},
        {"aud": "anon"},
        {"role": "anon"},
        {"is_anonymous": True},
        {"exp": 1},
        {"sub": "not-a-uuid"},
    ],
)
def test_bad_tokens_are_rejected(overrides):
    assert client.get("/api/me", headers=auth(uuid.uuid4(), **overrides)).status_code == 401


def test_tokens_signed_with_another_key_or_alg_none_are_rejected():
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": str(uuid.uuid4()), "role": "authenticated", "aud": "authenticated"}, "wrong", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    unsigned = pyjwt.encode({"sub": str(uuid.uuid4())}, None, algorithm="none")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_profile_is_created_and_updated():
    uid, headers = new_user()
    me = client.get("/api/me", headers=headers).json()
    assert me["id"] == str(uid) and me["language"] == "en" and me["evidence_retention_days"] == 365
    updated = client.patch(
        "/api/me", json={"display_name": "Asha", "age_group": "18_plus", "language": "hi"}, headers=headers
    ).json()
    assert updated["display_name"] == "Asha" and updated["language"] == "hi"
    bad = client.patch("/api/me", json={"language": "fr"}, headers=headers)
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_input"
    assert client.patch("/api/me", json={"is_admin": True}, headers=headers).status_code == 422


# Checks -----------------------------------------------------------------------------------

SCAM = "Raj: I love you so much\nMe: ok\nRaj: send me 5000 rs right now please, urgent\nRaj: don't tell anyone"


def test_conversation_check_without_account_is_not_stored():
    response = client.post("/api/check/conversation", json={"text": SCAM, "me": "Me"})
    assert response.status_code == 200
    body = response.json()
    assert body["level"] == "high"
    assert body["check_id"] is None
    assert body["ai"]["status"] == "not_configured"
    with SessionLocal() as db:
        assert db.scalar(select(Check)) is None


def test_conversation_check_history_never_contains_message_text():
    uid, headers = new_user()
    body = client.post("/api/check/conversation", json={"text": SCAM, "me": "Me"}, headers=headers).json()
    assert body["check_id"]
    with SessionLocal() as db:
        row = db.scalar(select(Check))
        stored = " ".join([row.label or "", *row.signals, *row.patterns, *row.stages])
        assert "5000" not in stored and "so much" not in stored and "Raj" not in stored and "anyone" not in stored
    history = client.get("/api/checks", headers=headers).json()
    assert history["items"][0]["level"] == "high"
    # Turning history off deletes it and stops new records.
    client.patch("/api/me", json={"keep_check_history": False}, headers=headers)
    assert client.get("/api/checks", headers=headers).json()["items"] == []
    assert client.post("/api/check/conversation", json={"text": SCAM}, headers=headers).json()["check_id"] is None


def test_senders_step_and_empty_input():
    senders = client.post("/api/check/conversation/senders", json={"text": SCAM}).json()
    assert senders["senders"] == ["Raj", "Me"]
    empty = client.post("/api/check/conversation", json={"text": "   "})
    assert empty.status_code == 400 and empty.json()["detail"]["code"] == "empty"


def test_structured_messages_and_situation_context():
    body = client.post(
        "/api/check/conversation",
        json={
            "messages": [{"sender": "Them", "text": "share the OTP you got"}, {"sender": "You", "text": "why?"}],
            "me": "You",
            "context": {"shared_codes": True},
        },
    ).json()
    assert body["level"] in {"high", "critical"}
    assert "contact_bank_now" in body["next_steps"]


def test_link_check():
    body = client.post("/api/check/link", json={"url": "http://sbi-kyc-update.xyz/login"}).json()
    assert body["status"] == "high_risk"
    assert {"brand_mismatch"} <= {s["id"] for s in body["signals"]}
    assert client.post("/api/check/link", json={"url": "hello there"}).json()["status"] == "invalid"


def test_image_check_finds_location_and_clean_copy_removes_it():
    uid, headers = new_user()
    data = jpeg_with_gps()
    body = client.post("/api/check/image", files={"file": ("photo.jpg", data, "image/jpeg")}, headers=headers).json()
    ids = {m["id"] for m in body["metadata"]}
    assert "location_embedded" in ids and "device_info" in ids
    assert body["sharing_risk"] == "high"
    assert body["ai"]["status"] == "not_requested"

    cleaned = client.post("/api/check/image/clean", files={"file": ("photo.jpg", data, "image/jpeg")}, headers=headers)
    assert cleaned.status_code == 200
    image = Image.open(io.BytesIO(cleaned.content))
    assert not image.getexif()


def test_image_check_rejects_non_images_and_needs_account():
    uid, headers = new_user()
    bad = client.post("/api/check/image", files={"file": ("x.jpg", b"not an image", "image/jpeg")}, headers=headers)
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "image_unsupported"
    assert client.post("/api/check/image", files={"file": ("x.png", plain_png(), "image/png")}).status_code == 401


def test_profile_check():
    body = client.post(
        "/api/check/profile",
        json={"video_call": "refused", "reverse_image": "different_name", "asked_for": ["money"], "claims": ["military_abroad"]},
    ).json()
    assert body["level"] == "high"
    assert "ask_live_video" in body["steps"]


def test_companion_without_ai_still_flags_danger():
    uid, headers = new_user()
    body = client.post(
        "/api/companion", json={"messages": [{"role": "user", "content": "he is outside my house, help me now"}]}, headers=headers
    ).json()
    assert body["reply"] is None and body["status"] == "not_configured"
    assert body["danger"] is True
    crisis = client.post(
        "/api/companion", json={"messages": [{"role": "user", "content": "I want to die"}]}, headers=headers
    ).json()
    assert crisis["crisis"] is True


def test_rate_limit_applies_to_anonymous_checks():
    for _ in range(10):
        assert client.post("/api/check/conversation", json={"text": "A: hi\nB: hello"}).status_code == 200
    limited = client.post("/api/check/conversation", json={"text": "A: hi\nB: hello"})
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "rate_limited"
    assert "retry-after" in limited.headers


# Evidence vault ---------------------------------------------------------------------------


def test_evidence_is_encrypted_at_rest_and_private():
    uid, headers = new_user()
    original = plain_png()
    created = client.post(
        "/api/evidence",
        data={"kind": "screenshot", "title": "Threat from Raj", "notes": "He said he'd post it", "platform": "Instagram"},
        files=[("files", ("shot.png", original, "image/png"))],
        headers=headers,
    )
    assert created.status_code == 200, created.text
    item_id = created.json()["id"]

    with SessionLocal() as db:
        item = db.get(EvidenceItem, uuid.UUID(item_id))
        assert b"Threat from Raj" not in item.title_enc and b"post it" not in (item.notes_enc or b"")
        record = db.scalar(select(EvidenceFile).where(EvidenceFile.evidence_id == item.id))
        stored = (Path(get_settings().local_storage_dir) / record.object_key).read_bytes()
        assert stored != original and original not in stored

    detail = client.get(f"/api/evidence/{item_id}", headers=headers).json()
    assert detail["title"] == "Threat from Raj" and detail["notes"] == "He said he'd post it"
    file_id = detail["files"][0]["id"]
    assert len(detail["files"][0]["sha256"]) == 64
    download = client.get(f"/api/evidence/{item_id}/files/{file_id}", headers=headers)
    assert download.content == original
    assert download.headers["content-disposition"].startswith("attachment")

    # Someone else cannot see, download or delete it.
    _, other = new_user()
    assert client.get(f"/api/evidence/{item_id}", headers=other).status_code == 404
    assert client.get(f"/api/evidence/{item_id}/files/{file_id}", headers=other).status_code == 404
    assert client.delete(f"/api/evidence/{item_id}", headers=other).status_code == 404
    assert client.get("/api/evidence", headers=other).json()["items"] == []

    activity = [a["action"] for a in client.get("/api/me/activity", headers=headers).json()["items"]]
    assert "evidence.saved" in activity and "evidence.file_opened" in activity

    assert client.delete(f"/api/evidence/{item_id}", headers=headers).json() == {"deleted": True}
    assert not (Path(get_settings().local_storage_dir) / record.object_key).exists()


def test_evidence_rejects_disguised_files_and_empty_items():
    uid, headers = new_user()
    exe = b"MZ\x90\x00" + b"\x00" * 100
    bad = client.post(
        "/api/evidence",
        data={"kind": "document", "title": "x"},
        files=[("files", ("a.pdf", exe, "application/pdf"))],
        headers=headers,
    )
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "unsupported_file"
    empty = client.post("/api/evidence", data={"kind": "note", "title": "x"}, headers=headers)
    assert empty.status_code == 400


def test_retention_setting_updates_expiry():
    uid, headers = new_user()
    client.post("/api/evidence", data={"kind": "note", "title": "n", "notes": "text"}, headers=headers)
    assert client.get("/api/evidence", headers=headers).json()["items"][0]["expires_at"]
    client.patch("/api/me", json={"evidence_retention_days": 0}, headers=headers)
    assert client.get("/api/evidence", headers=headers).json()["items"][0]["expires_at"] is None


# Incidents --------------------------------------------------------------------------------


def test_incident_report_round_trip_and_evidence_ownership():
    uid, headers = new_user()
    _, other = new_user()
    theirs = client.post("/api/evidence", data={"kind": "note", "title": "not yours", "notes": "x"}, headers=other).json()["id"]
    mine = client.post("/api/evidence", data={"kind": "note", "title": "mine", "notes": "x"}, headers=headers).json()["id"]
    body = {
        "incident_type": "financial_fraud",
        "title": "Investment app",
        "details": {
            "summary": "I lost money",
            "timeline": [{"when": "3 March", "what": "Paid 10000"}],
            "financial_loss": {"amount": "10000"},
        },
        "evidence_ids": [mine, theirs],
    }
    created = client.post("/api/incidents", json=body, headers=headers).json()
    assert [e["id"] for e in created["evidence"]] == [mine]
    fetched = client.get(f"/api/incidents/{created['id']}", headers=headers).json()
    assert fetched["details"]["timeline"][0]["what"] == "Paid 10000"
    assert client.get(f"/api/incidents/{created['id']}", headers=other).status_code == 404
    draft = client.post(f"/api/incidents/{created['id']}/draft", json={}, headers=headers)
    assert draft.status_code == 503 and draft.json()["detail"]["code"] == "ai_not_configured"


# Contacts and emergencies -----------------------------------------------------------------


def test_contact_validation():
    uid, headers = new_user()
    ok = client.post("/api/contacts", json={"name": "Maa", "phone": "98765 43210"}, headers=headers).json()
    assert ok["phone"] == "+919876543210"
    bad = client.post("/api/contacts", json={"name": "X", "phone": "12345"}, headers=headers)
    assert bad.status_code == 422 and "phone" in bad.json()["detail"]["fields"]
    none = client.post("/api/contacts", json={"name": "No way to reach"}, headers=headers)
    assert none.status_code == 400


def test_emergency_flow_and_status_links():
    uid, headers = new_user(display_name="Asha Verma")
    client.post(
        "/api/contacts",
        json={"name": "Maa", "phone": "+919876543210", "email": "maa@example.com", "share_location": True},
        headers=headers,
    )
    client.post("/api/contacts", json={"name": "Neighbour", "phone": "+919812345678", "share_location": False}, headers=headers)

    started = client.post(
        "/api/emergency", json={"location": {"lat": 28.61, "lng": 77.2, "accuracy": 20}}, headers=headers
    ).json()
    assert started["created"] is True
    event = started["event"]
    statuses = {d["recipient"]: d["status"] for d in event["deliveries"]}
    assert statuses == {"Maa": "not_configured", "Neighbour": "no_address"}  # never claims "sent"
    shares = {s["name"]: s for s in event["shares"]}
    assert shares["Maa"]["shows_location"] and not shares["Neighbour"]["shows_location"]

    # A second press does not create a second emergency.
    again = client.post("/api/emergency", json={}, headers=headers).json()
    assert again["created"] is False and again["event"]["id"] == event["id"]

    maa_token = shares["Maa"]["link"].rsplit("/", 1)[1]
    neighbour_token = shares["Neighbour"]["link"].rsplit("/", 1)[1]
    seen = client.get(f"/api/status/{maa_token}").json()
    assert seen["name"] == "Asha" and seen["status"] == "active" and seen["location"]["lat"] == 28.61
    assert "email" not in str(seen) and "Verma" not in str(seen)
    assert client.get(f"/api/status/{neighbour_token}").json()["location"] is None
    assert client.get("/api/status/not-a-real-token").status_code == 404

    client.post(f"/api/emergency/{event['id']}/location", json={"lat": 28.62, "lng": 77.21}, headers=headers)
    assert client.get(f"/api/status/{maa_token}").json()["location"]["lat"] == 28.62

    _, other = new_user()
    assert client.post(f"/api/emergency/{event['id']}/end", headers=other).status_code == 404

    ended = client.post(f"/api/emergency/{event['id']}/end", headers=headers).json()["event"]
    assert ended["status"] == "ended"
    assert client.get(f"/api/status/{maa_token}").json()["status"] == "ended"
    with SessionLocal() as db:
        row = db.get(EmergencyEvent, uuid.UUID(event["id"]))
        row.share_expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert client.get(f"/api/status/{maa_token}").status_code == 404


def test_emergency_recording_pieces_join_in_vault():
    uid, headers = new_user()
    event_id = client.post("/api/emergency", json={}, headers=headers).json()["event"]["id"]
    first = b"\x1a\x45\xdf\xa3" + b"A" * 100
    second = b"B" * 100
    r1 = client.post(
        f"/api/emergency/{event_id}/recording",
        data={"part": "0", "mime_type": "audio/webm;codecs=opus"},
        files={"chunk": ("p0", first)},
        headers=headers,
    )
    assert r1.status_code == 200, r1.text
    client.post(
        f"/api/emergency/{event_id}/recording",
        data={"part": "1", "mime_type": "audio/webm"},
        files={"chunk": ("p1", second)},
        headers=headers,
    )
    evidence_id = r1.json()["evidence_id"]
    joined = client.get(f"/api/evidence/{evidence_id}/recording", headers=headers)
    assert joined.content == first + second
    missing = client.post(
        f"/api/emergency/{client.post('/api/emergency', json={}, headers=new_user()[1]).json()['event']['id']}/recording",
        data={"part": "0", "mime_type": "audio/webm"},
        files={"chunk": ("p", first)},
        headers=headers,
    )
    assert missing.status_code == 404


def test_missed_meeting_checkin_starts_an_emergency():
    uid, headers = new_user(display_name="Asha")
    contact = client.post("/api/contacts", json={"name": "Priya", "phone": "+919876543210"}, headers=headers).json()
    start = now() - timedelta(hours=2)
    meeting = client.post(
        "/api/meetings",
        json={
            "person_name": "Rohan",
            "place": "Cafe on MG Road",
            "starts_at": start.isoformat(),
            "expected_end_at": (start + timedelta(hours=3)).isoformat(),
            "contact_id": contact["id"],
        },
        headers=headers,
    ).json()
    started = client.post(f"/api/meetings/{meeting['id']}/start", json={}, headers=headers).json()
    assert "Cafe on MG Road" in started["plan_text"]
    with SessionLocal() as db:
        row = db.get(SafeMeeting, uuid.UUID(meeting["id"]))
        row.next_checkin_due_at = now() - timedelta(minutes=30)
        db.commit()
        assert escalate_missed(db) == 1
    event = client.get("/api/emergency/active", headers=headers).json()["event"]
    assert event["trigger"] == "missed_checkin"
    assert [s["name"] for s in event["shares"]] == ["Priya"]
    notes = client.get("/api/notifications", headers=headers).json()
    assert notes["unread"] >= 1


# Guardians --------------------------------------------------------------------------------


def test_guardian_link_needs_consent_and_shows_only_agreed_data():
    guardian_id, guardian = new_user(display_name="Sunita")
    child_id, child = new_user(display_name="Meera", age_group="13_17")

    invite = client.post(
        "/api/guardian/invites", json={"child_label": "Meera", "permissions": {"live_location": False}}, headers=guardian
    ).json()
    preview = client.post("/api/guardian/invites/preview", json={"code": invite["code"]}, headers=child).json()
    assert preview["guardian_name"] == "Sunita" and preview["permissions"]["live_location"] is False
    assert client.post("/api/guardian/invites/preview", json={"code": invite["code"]}, headers=guardian).status_code == 400

    link_id = client.post("/api/guardian/invites/accept", json={"code": invite["code"].lower()}, headers=child).json()["link_id"]
    assert (
        client.post("/api/guardian/invites/accept", json={"code": invite["code"]}, headers=child).status_code == 404
    )  # single use

    # Nothing is visible until the child shares something.
    overview = client.get(f"/api/guardian/links/{link_id}/overview", headers=guardian).json()
    assert overview["last_location"] is None and overview["checkins"] == []

    zone = client.post(
        f"/api/guardian/links/{link_id}/zones",
        json={"name": "School", "lat": 28.6, "lng": 77.2, "radius_m": 300},
        headers=guardian,
    )
    assert zone.status_code == 200
    client.post("/api/checkins", json={"status": "safe", "location": {"lat": 28.6001, "lng": 77.2001}}, headers=child)
    overview = client.get(f"/api/guardian/links/{link_id}/overview", headers=guardian).json()
    assert overview["checkins"][0]["status"] == "safe"
    assert overview["last_location"]["source"] == "checkin"
    assert overview["zone_events"][0] == {"zone": "School", "event": "entered", "at": overview["zone_events"][0]["at"]}

    # Live sharing was not agreed, so live locations stay private even if the child shares them.
    client.post("/api/location/live", json={"minutes": 30}, headers=child)
    client.post("/api/location", json={"lat": 19.07, "lng": 72.87}, headers=child)
    overview = client.get(f"/api/guardian/links/{link_id}/overview", headers=guardian).json()
    assert overview["last_location"]["lat"] == pytest.approx(28.6001)
    assert overview["live_sharing"]["active"] is False

    # The child cannot use the guardian view, and strangers see nothing.
    assert client.get(f"/api/guardian/links/{link_id}/overview", headers=child).status_code == 404
    assert client.get(f"/api/guardian/links/{link_id}/overview", headers=new_user()[1]).status_code == 404

    # The child can end the link; the guardian is told and loses access.
    assert client.delete(f"/api/guardian/links/{link_id}", headers=child).json() == {"ended": True}
    assert client.get(f"/api/guardian/links/{link_id}/overview", headers=guardian).status_code == 404
    titles = [n["title"] for n in client.get("/api/notifications", headers=guardian).json()["items"]]
    assert "A SAHELI link has ended" in titles


def test_location_updates_refused_when_not_sharing():
    _, headers = new_user()
    assert client.post("/api/location", json={"lat": 1, "lng": 1}, headers=headers).status_code == 409


# Watch ------------------------------------------------------------------------------------


def test_watch_pairing_scopes_and_revocation():
    uid, headers = new_user(display_name="Asha Verma")
    client.post(
        "/api/contacts", json={"name": "Maa Verma", "phone": "+919876543210", "email": "maa@example.com"}, headers=headers
    )
    code = client.post("/api/devices/pairing-code", json={"name": "Galaxy Watch"}, headers=headers).json()["code"]
    paired = client.post("/api/watch/pair", json={"code": code}).json()
    watch = {"Authorization": f"Device {paired['device_token']}"}
    assert client.post("/api/watch/pair", json={"code": code}).status_code == 404  # single use

    home = client.get("/api/watch/home", headers=watch).json()
    assert home["first_name"] == "Asha"
    assert home["contacts"] == [{"name": "Maa", "phone": "+919876543210"}]  # no emails, no surnames
    assert home["emergency"]["active"] is False

    assert client.post("/api/watch/location", json={"lat": 1, "lng": 1}, headers=watch).status_code == 409
    sos = client.post("/api/watch/sos", json={"location": {"lat": 28.6, "lng": 77.2}}, headers=watch).json()
    assert sos["active"] is True
    assert client.get("/api/emergency/active", headers=headers).json()["event"]["trigger"] == "watch"
    client.post("/api/watch/sos/end", headers=watch)
    assert client.get("/api/emergency/active", headers=headers).json()["event"] is None

    # A watch token cannot be used as a user session, and vice versa.
    assert client.get("/api/me", headers={"Authorization": f"Bearer {paired['device_token']}"}).status_code == 401
    assert client.get("/api/watch/home", headers=headers).status_code == 401

    device_id = client.get("/api/devices", headers=headers).json()["items"][0]["id"]
    client.delete(f"/api/devices/{device_id}", headers=headers)
    assert client.get("/api/watch/home", headers=watch).status_code == 401


# Account ----------------------------------------------------------------------------------


def test_export_and_delete_account():
    uid, headers = new_user(display_name="Asha")
    client.post("/api/contacts", json={"name": "Maa", "phone": "+919876543210"}, headers=headers)
    item = client.post(
        "/api/evidence",
        data={"kind": "screenshot", "title": "proof"},
        files=[("files", ("a.png", plain_png(), "image/png"))],
        headers=headers,
    ).json()
    exported = client.get("/api/me/export", headers=headers).json()
    assert exported["trusted_contacts"][0]["name"] == "Maa"
    assert exported["evidence"][0]["title"] == "proof"

    with SessionLocal() as db:
        key = db.scalar(select(EvidenceFile.object_key).where(EvidenceFile.evidence_id == uuid.UUID(item["id"])))
    assert client.request("DELETE", "/api/me", json={"confirm": "nope"}, headers=headers).status_code == 422
    deleted = client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=headers).json()
    assert deleted["deleted"] is True
    assert not (Path(get_settings().local_storage_dir) / key).exists()
    with SessionLocal() as db:
        assert db.scalar(select(EvidenceItem)) is None
