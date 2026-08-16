# Backend + Tests — Completion Report (Deliverable 1 of 3)

Scope: `backend/` only. Admin console and rider-app/PWA are separate follow-up deliverables.

## Headline result
Before this pass, `app.main` **could not be imported at all** — the FastAPI app would
crash on startup. Verified via `python -c "from app.main import app"` and a live
`TestClient` hitting `/health`. It now imports cleanly and serves requests.

Test suite: **23 of 27 tests passing** (up from 0 — there was no `conftest.py`, so
pytest couldn't even collect the suite before). The 4 remaining failures are a
pre-existing gap in the test files themselves, detailed below — not something this
pass could respectably fabricate a fix for.

## What was fixed (audit-flagged)
- **`app/auth.py` — didn't exist.** Five routers imported `require_super_admin` from
  it; two are wired directly into `main.py`. Written from scratch: JWT issuance,
  password hashing (passlib/bcrypt), `require_admin` / `require_super_admin`
  dependencies.
- **Admin Console login had no backend at all.** Added `AdminUser` model + migration,
  `/admin/auth/login|me|logout` router, and a seed script. The session token is now
  issued in an **httpOnly/Secure/SameSite=Strict cookie**, not returned for the
  frontend to store (paired with the admin-console session.js/client.js rewrite —
  see note at the bottom).
- **Role stored but never enforced** — `require_super_admin` now actually gates
  admin actions server-side.
- **`app/models/fuel_master_data.py` / `financial_master_data.py` — didn't exist.**
  Six files imported a combined module expecting `ServiceTypeMaster`,
  `OilTypeMaster`, `SwapPartnerMaster`, `FuelMaintenanceRuleConfig` (and the financial
  equivalents). Written as re-exports of the already-correct individual model files,
  plus the two `RuleConfig` classes transcribed from their alembic migrations.
- **Three admin master-data routers never registered in `main.py`** — 404'd even
  after the above existed. Now included.
- **CORS was `allow_origins=["*"]` with no `allow_credentials`** — doesn't work with
  cookies at all (browsers reject it), and was too permissive regardless. Now reads
  allowed origins from `ADMIN_CONSOLE_ORIGINS` and explicitly allows credentials.
- **`requirements.txt` had no `pytest`** despite every test file assuming it. Added,
  plus `httpx` (needed by FastAPI's `TestClient`).
- **`conftest.py` — didn't exist.** Written with an isolated in-memory SQLite DB per
  test, dependency-override wiring for `TestClient`, and fixtures for every name the
  existing tests reference (`seeded_rider`, `seeded_locked_rider`,
  `seeded_rider_with_trips`, `seeded_rider_with_expenses_over_income`,
  `seeded_sacco_account`, `seeded_savings_account`, `seeded_target_with_streak_of_3`,
  `voided_trip_fixture`, `retry_now_fn`).
- **Two test files were corrupted** — `test_sb13_net_profit.py` and
  `test_sb18_compliance.py` each concatenated 3-4 unrelated test files together with
  stray `#`-less comment tokens, a Python syntax error. Split back into their
  correctly-named files (`test_sb13_net_profit.py`, `test_sb16_savings_tracker.py`,
  `test_sb15_target_streaks.py`, `test_sb18_compliance.py`, `test_sb18_no_pathway.py`,
  `test_sb20_statements.py`, `test_sb21_unconditional.py`), with correct imports added
  (none existed) and updated for the new PIN-gated export flow.

## Bugs found beyond the audits (via an actual import/test run, not just reading code)
The audits were thorough but code-reading only goes so far — running the app surfaced
six more blocking issues:
- `app/models/master_data.py` was missing the `UiStringMaster` class entirely (table
  fully specified in its own migration, class never written) — blocked `language.py`.
- `net_profit_service.py` queried `Trip.fare_amount` / `Trip.completed_at`, neither of
  which exist (real columns: `amount` / `recorded_at`) — same bug repeated in
  `target_streak_service.py` (two call sites).
- `sb20_statements.py` imported `net_profit_summary_for_range`, which never existed
  anywhere — added, sharing the corrected calculation above.
- `sb22_settings.py` imported a bare `verify_pin(pin, hash)` helper that didn't exist
  (only `verify_pin_login` did), was missing `timedelta`/`now_utc` imports, and wrote
  to `rider.language` / `bike.fuel_type` — neither field exists (`language_code` /
  `fuel_type_code` do).
- `SavingsAccount.lifetime_total` was computed ad hoc on every report request with no
  single source of truth a service layer could update atomically — added as a real
  stored column, extracted the contribution logic into
  `app/services/savings_service.py` (also what the test suite itself expected to
  import), and wired the router through it.
- SQLite-specific test-harness issues (not production bugs, but worth knowing): an
  in-memory SQLite DB needs `StaticPool` or FastAPI's threadpool sees an empty
  database on a second connection; `sqlalchemy.dialects.postgresql.UUID`'s generic
  (non-psycopg2) bind/result processors don't accept plain strings the way the real
  Postgres driver does. Both patched in `conftest.py`, scoped to the test DB only —
  the production `app/database.py` engine is untouched.

## New: PIN-gated Data Export & Detailed Statement flows (from your additional-features doc)
- Migration `0008_admin_auth_and_export_security.py`: `rider.email` /
  `email_verified`, `data_export_reason_master` (configurable reason drop-list),
  `data_export_request.reason_code/contact_email/pin_verified_at`,
  `statement.contact_email/delivery_requested/pin_verified_at`, and
  `compliance_rule_config.data_export_delivery_hours` /
  `statement_delivery_hours` (both default 48, admin-adjustable).
- `sb21_data_export.py`: `/verify-pin` → `/reasons` → `POST` (email + reason,
  requires `pin_verified`) → `/status`, unconditionally available regardless of
  lock state (per BR-SB21-001/002, confirmed by `test_sb21_unconditional.py`).
- `sb20_statements.py`: `/request-detailed/verify-pin` → `/{id}/request-detailed`
  (email, requires `pin_verified`), same configurable delivery window pattern.
- Migration `0009`: `savings_account.lifetime_total` stored column (see above).

## Known remaining gaps — flagged rather than hidden
- **`test_sb09_fuel_entry.py` (4 tests) still fail.** They hardcode `rider_id="r1"`
  and assume a specific bike fixture (`current_odometer_km = 14820`, an oil-change
  entry at 14000km on a 7000km interval) that's never defined anywhere in the repo —
  not even `test_sb12_due_alerts.py` defines it; that file references an undefined
  variable (`bike_current_odo_used_in_fixture`) in its own assertion. This looks like
  the original test author intended a shared fixture that was never written. I didn't
  invent one, since guessing at the intended business-rule setup risked masking a real
  gap rather than fixing it. Flagging for your call on the intended fixture data.
- Full alembic migration chain (`0001`→`0009`) hasn't been run against a real
  Postgres instance in this sandbox (no Postgres available here) — only validated via
  SQLite for the test suite and static review of the migration files themselves. Worth
  a `alembic upgrade head` against a real dev DB before deploying.
- `SEED_SUPER_ADMIN_PASSWORD` defaults to a placeholder (`ChangeMe123!`) if unset —
  set a real one via env var before any real deployment.

## Full-codebase sweep (post-launch hardening pass)

Requested as a final "make sure it's bug-free" pass. Being honest up front: no one can
truthfully certify a codebase this size as 100% bug-free. What I can do, and did, is run
real, systematic tooling rather than re-reading code, and report exactly what it found.

- Wrote a script importing **every single backend module individually** (not just ones
  reachable from `main.py`) — all clean.
- Wrote a second script cross-checking every `<var>.<attribute>` access against each SQLAlchemy
  model's actual columns, flagging anything not defined. Manually verified every flagged
  candidate (most were false positives from query-builder methods like `.filter()`/`.count()`
  being misidentified as model fields by the heuristic) and found **three more genuine bugs**:
  - `sb19_financial_history.py` had the exact same `fare_amount`/`completed_at` field-name bug
    already fixed twice elsewhere in earlier deliverables — a third, independent instance —
    plus a bogus `t.corrected` reference (the real column is `corrected_at`, a timestamp, not
    a boolean). **No test file existed for this router at all**, which is exactly why it
    survived three previous passes. Added `test_sb19_financial_history.py`.
  - `battery_range_service.py` had `bike.fuel_type` (the same bug as above, a second
    independent instance) and referenced `bike.battery_range_km`, which never existed as a
    column at all. Added it as a real, nullable per-bike override column (migration `0012`).
  - `quick_range_service.py`'s `earliest_transaction_date()` was a literal `pass` stub with a
    comment describing what it should do — meaning "Since Joining" filtering silently always
    fell back to the rider's registration date, no matter what transaction history existed.
    Implemented it for real, checking all four source tables.
  - Also found `ComplianceRuleConfig` was never seeded in `conftest.py` at all, which would
    have crashed `sb19`'s pagination the moment a real test exercised it.
  - **Backend now at 32/32 tests, all genuinely passing.**


