# SAHELI architecture

This document records the decisions made before building SAHELI and the reasons for them. It is the reference for anyone changing the system. If the code and this document disagree, fix one of them.

## 1. Shape of the system

```
Browser (phone / laptop / small-screen "Safety Mode")
   │  React + Vite SPA, served by the API container
   │  Supabase Auth (email + password, recovery) in the browser
   ▼
SAHELI API  (Python, FastAPI, one service)
   │  verifies the Supabase access token on every request
   │  owns all authorisation, validation, rate limits, audit log
   ├── Supabase Postgres   (relational data, Row Level Security on, no client access)
   ├── Supabase Storage    (private bucket, files encrypted by the API before upload)
   ├── Anthropic API       (Claude: explanations, companion, image review, screenshot reading)
   ├── Google Safe Browsing (optional, known-threat lookup for links)
   └── Resend              (optional, email alerts to trusted contacts)
```

One deployable service. The API serves the built frontend from the same origin, so there is no CORS surface, one domain, one TLS certificate and one set of security headers. Nothing here needs microservices.

## 2. Database: Supabase, not Neon

Both are managed PostgreSQL. The difference is what comes with it.

| Need | Supabase | Neon |
| --- | --- | --- |
| Postgres | Yes | Yes |
| Auth with email verification, password recovery, refresh-token rotation, MFA | Built in | Separate product to integrate |
| Private object storage for evidence | Built in | Separate vendor (S3 / R2) |
| Region close to Indian users | Mumbai (ap-south-1) | Singapore nearest at time of writing |

SAHELI needs all three, and the less security-critical code we write ourselves the better. **Supabase** is the choice. We do not use both.

How we use it:

- **Auth**: the browser signs in with `@supabase/supabase-js`. The API verifies the access token (JWT) using the project's JWKS (asymmetric keys) or the legacy shared secret. The API never sees passwords.
- **Postgres**: only the API talks to the database, over a direct connection. Row Level Security is enabled on every table with no policies, so the public `anon` key cannot read or write any SAHELI table through the auto-generated REST API, even by mistake.
- **Storage**: one private bucket. The API encrypts each file (AES-256-GCM) before upload, so a leaked bucket object is unreadable without the API's key.
- Our own `profiles` table is keyed by the Supabase user id. We do not add foreign keys into Supabase's internal `auth` schema, which keeps the schema portable and testable on plain Postgres.

## 3. Authentication and authorisation

- Supabase Auth issues short-lived access tokens; supabase-js refreshes them.
- Every API route declares what it needs: no user, an optional user (anonymous checks), a signed-in user, or a paired watch device token.
- Ownership is checked in the API on every query (`WHERE owner_id = :me`). Guardian access to a child's data goes through an explicit, active, consented `guardian_links` row and only for the permissions recorded on that row.
- Watch devices never get a user session. Pairing issues a random device token (stored hashed) with a fixed, small set of scopes: SOS, check-in, location, minimal contact list.
- Account deletion removes all rows (cascade), all stored files, and the Supabase auth user.

Local development uses `dev/auth_emulator.py`, a stand-in for the handful of Supabase Auth endpoints the frontend calls, so the full app can run without a cloud project. It refuses to run unless explicitly started, binds to localhost only, and is never part of the production image.

## 4. Storage and privacy of content

| Content | Stored? | Where | Protection |
| --- | --- | --- | --- |
| Conversation pasted for a check | No | Processed in memory only | Redacted before any AI call |
| Check result (risk level, signal types, stage timeline) | Yes, if history is on (user setting) | Postgres | No message text, no quotes |
| Evidence the user chooses to save | Yes | Text in Postgres, files in Storage | AES-256-GCM, owner-only, SHA-256 recorded, audit-logged |
| Companion chat | No | Kept in the browser tab only | Redacted before the AI call |
| Images sent to the image check | No | Processed in memory only | Optional AI review needs explicit consent per check |
| Emergency location | Yes, during an emergency | Postgres | Visible to the user, chosen contacts via an expiring link |

Retention: evidence is kept for the period the user picks (90 days, 1 year (default) or until deleted). A background job deletes expired items. Users can export all their data as JSON and delete their account.

## 5. AI architecture

SAHELI does not send a conversation to a model and ask "is this a scam". The pipeline is layered and the risk level is decided by code, not by the model.

```
Input (paste / .txt export / screenshots)
 → Parse into messages (WhatsApp formats, "Name: text", plain lines)
 → Redact personal data (phone, email, UPI id, card, Aadhaar, PAN, OTP, account no.)
 → Rule signals (English, Hindi, Hinglish lexicons; per message, per sender)
 → Sequence analysis (stage order, repeated pressure after a refusal, speed of escalation)
 → Optional AI review (Claude): confirm or set aside each rule signal, add missed signals
      with a verbatim quote that must exist in the text, write a calm summary
 → Deterministic risk level with the rules that fired ("How SAHELI decided")
 → Next steps chosen from the patterns found and what the user says has happened
```

Why this split:

- **Rules** are fast, free, explainable, testable and work when the AI is down.
- **The model** adds what rules miss: context, sarcasm, slang, a genuine relationship. It can set aside a rule signal, but it cannot remove the safety floor for threats, blackmail or credential requests, and it cannot lower anything if the text contains instructions aimed at an AI (prompt injection).
- **Model output is validated**: fixed signal vocabulary, message index must exist, quote must appear in that message, banned phrasing ("is a scammer", "definitely a scam") is rejected.
- **No numeric score** is shown. The user sees a level (Low, Medium, High, Critical), the specific reasons, and how much information SAHELI had.

Model: `claude-opus-5-5` by default, configurable with `SAHELI_LLM_MODEL`. Server-side refusal fallback is enabled. If no API key is configured, or the call fails, every feature still returns the rule-based result and says clearly that the AI review did not run.

## 6. Link checking

Deterministic checks on the URL itself (lookalike domains, punycode, brand names in the wrong domain, IP hosts, `@` tricks, shorteners, risky TLDs, credential-bait paths) plus Google Safe Browsing if a key is configured. Shortened links are expanded by asking only known shortener hosts for their redirect; SAHELI never fetches arbitrary destination pages from its server, which avoids server-side request forgery. A link is never called "safe". The best result is "No warning signs found", with what was and was not checked.

## 7. Image checking

- Always (no AI): file validation, metadata reading (GPS location, device, edit software, AI-generator markers such as IPTC `trainedAlgorithmicMedia`, C2PA manifests, generator parameters), and a "download a copy without hidden data" option.
- With consent: Claude reviews the image for privacy exposure (faces, uniforms, documents, house numbers, landmarks) and visible signs of manipulation. AI-generated detection is presented as uncertain, always.
- The page tells people not to upload intimate images, and never images of anyone under 18. Private image abuse goes to the dedicated help page (StopNCII, Take It Down, platform and portal reporting).

## 8. Emergency, recording, voice, watch: what the platforms allow

| Capability | What is possible on the web | What SAHELI does |
| --- | --- | --- |
| SOS | Yes, while the page is open | Hold-to-send button, alert record, location, contact notifications |
| Notify contacts | Server email (if configured); the user's own phone for SMS / WhatsApp | Both, and the screen shows exactly which ones went out |
| Live location | Only while the page is open and permission is granted | Updates every 30 s during an emergency, shared via an expiring status link |
| Recording | MediaRecorder, foreground only, with a browser permission prompt | Visible recording indicator, uploads 10-second pieces to the vault so evidence survives interruption |
| Background voice wake word | Not possible on the web | Optional listening while the SOS page is open; OS-level voice shortcuts (Siri Shortcuts, Google Assistant routines) open the SOS page with a cancellable countdown |
| Smartwatch | No general way to run web apps on watches | Watch device pairing, scoped watch API, and a small-screen Safety Mode UI. Native Wear OS / watchOS apps are future work and use the same API |
| Geofence alerts | No background location on the web | Safe zones are evaluated whenever a child's device shares a location (check-in, SOS, live sharing) |

The product says these limits out loud instead of implying more.

## 9. Child and guardian model

One account type. A guardian invites; the child accepts on their own signed-in device after seeing exactly what will be shared. Either side can see the link, either side can end it, and the other side is told. Location is shared only on SOS, check-ins and time-limited live sharing that the child turns on. No silent tracking.

## 10. Deployment

- One Docker image: build the frontend, then serve it from FastAPI with the API under `/api`.
- Host: an always-on container (Render, Fly.io or similar) in or near Mumbai. Free tiers that sleep are not acceptable for an emergency feature.
- Supabase project in Mumbai (ap-south-1).
- Secrets only in the host's secret store. `.env` files are git-ignored.

See `docs/DEPLOYMENT.md` and `docs/LAUNCH_CHECKLIST.md`.

## 11. Security and privacy risks considered

| Risk | Mitigation |
| --- | --- |
| Someone reads another user's evidence | Owner check on every query, RLS deny-all on tables, private bucket, app-level encryption, audit log |
| XSS steals the session | Strict Content-Security-Policy, no `dangerouslySetInnerHTML`, React escaping, no third-party scripts |
| Malicious upload | Size limits, type sniffing by content, Pillow verification, decompression-bomb limit, files never served inline |
| Prompt injection in pasted chats | Content passed as data, injection detector, model cannot lower safety floors, output validation |
| SSRF via link checker | No arbitrary fetches; only redirect lookups on a fixed list of shortener hosts |
| Abuse of free AI calls | Per-user and per-IP rate limits stored in Postgres, size limits on input |
| Emergency status link leaks | 128-bit random token, only first name and location, expires 24 h after the emergency ends, no indexing |
| Guardian misuse (surveillance) | Consent at link time, child-visible permissions, no background tracking, either side can end the link |
| Fake reassurance | Never "safe"; uncertainty stated; rule floors for the most dangerous patterns |

## 12. Roadmap

Built in the order of the master brief (phases 1 to 17). `docs/STATUS.md` records what is done, what is partly done and what is not started. Nothing is described as finished until it has been run and tested.
