# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TTPU Bandlik Markazi (Turin Polytechnic University Tashkent — Employment Center) CRM. It collects students' employment status via a Telegram bot, verifies uploaded documents with AI (Gemini), and distributes vacancies through a Telegram channel + bot. A staff dashboard drives leads, employers, surveys, and analytics.

UI and most docs/comments are in **Uzbek** (with Russian for bot users). Match that language when editing user-facing strings, admin labels, and docs. Canonical, up-to-date docs are in `docs/` (`loyiha-hujjati.md`, `korxona-va-lead-spec.md`, `amaliyot-internship-spec.md`); root-level docs elsewhere may be stale.

## Monorepo layout

Four runtime services, orchestrated by `docker-compose.yml` **for local development**:

| Service | Tech | Port | Directory |
|---|---|---|---|
| `db` | PostgreSQL 15 | 5432 (localhost only) | — |
| `server` | Django 5 + DRF + Gunicorn | 9006 → 8000 | `server/` |
| `bot2` | aiogram 3 (Telegram, long-polling) | — | `bot2_service/` |
| `dashboard` | Next.js 16 + React 19 (standalone) | 3000 | `dashboard/` |
| `followup_cron` | reuses server image; `run_scheduler` loop | — | `server/` |

**Production does NOT run Docker.** `.github/workflows/cd.yml` (push to `main`, self-hosted runner) deploys to `/home/giga/ttpu_crm`: git pull → pip install into per-service venvs → migrate/collectstatic → `supervisorctl restart` (`ttpu_crm` gunicorn, `ttpu-bot2`, `ttpu-dashboard`) → curl `/healthz`. Root `nginx.conf` is the prod reverse proxy (port 8084, marketing.polito.uz): `/api|/superadmin|/static|/media|/l/|/healthz` → Django :9006, everything else → Next :3000. Note `/l/` is proxied separately because it lives outside `/api/`.

**CI** (`.github/workflows/ci.yml`, every push/PR): Django tests run under **PostgreSQL 15** (not SQLite) with `DJANGO_DEBUG=false` on Python 3.12; the bot job only installs `bot2_service/requirements.txt` and `py_compile`s the main modules.

## Centralized environment

**All services read a single root `.env`** (there are no per-service `.env` files). Copy `.env.example` → `.env` and fill it in before anything runs; compose points every service's `env_file` at it, and local (non-Docker) runs use `load_dotenv(find_dotenv())` which walks up to the repo root. `NEXT_PUBLIC_API_URL` is the exception — it is baked into the dashboard bundle **at build time** via a Docker build-arg, so changing it requires a rebuild.

## Commands

**Full stack (Docker, recommended):**
```bash
cp .env.example .env    # fill in secrets
docker compose up --build
```

**Server (Django) — local dev:**
```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export USE_SQLITE=1        # SQLite; only permitted when DJANGO_DEBUG is truthy
python manage.py migrate
python manage.py create_admin --email admin@example.com --password pass1234
python manage.py runserver 0.0.0.0:8000
```

**Server tests (pytest + pytest-django):**
```bash
cd server
pytest                                   # all tests (config in pytest.ini)
pytest tests/test_bot2_survey.py         # one file
pytest tests/test_service_token.py::test_name   # one test
```
Tests live in `server/tests/` (not per-app). `server/conftest.py` runs before `django.setup()` to set test-only env defaults (secret key, disable Secure-cookie/SSL-redirect so the test client can use plain HTTP under prod-safe defaults). **`bot2_service/` and `dashboard/` have no tests.**

**Dashboard (Next.js):**
```bash
cd dashboard
npm install
npm run dev      # dev server
npm run build    # standalone production build → node .next/standalone/server.js
npm run lint     # eslint (flat config, eslint-config-next)
```

**Bot (local):**
```bash
cd bot2_service
python -m bot2_service.main    # needs src/ on PYTHONPATH (Docker sets PYTHONPATH=/app/src)
```

## Cross-service authentication (important, non-obvious)

Three distinct auth mechanisms coexist:

1. **Dashboard ↔ server: JWT cookies.** Default DRF auth is `authn.authentication.CookieJWTAuthentication` — it reads `Authorization: Bearer` first, then falls back to the HttpOnly `access_token` cookie, and checks a custom `RevokedToken` blacklist. The dashboard also mirrors tokens in `localStorage` and sets a non-HttpOnly `dashboard_auth` marker cookie so Next's `proxy.ts` (Next 16's renamed middleware) can gate routes. `lib/api.ts` auto-refreshes on 401 (single-flight) via `/api/v1/auth/refresh`.

2. **Bot ↔ server: service token.** The bot sends header `X-SERVICE-TOKEN: <raw token>` on every request. The server stores only the **SHA-256 hash** and compares in constant time (`common/auth.py::verify_service_token`, checking the `common.ServiceToken` table then falling back to `settings.SERVICE_TOKENS`). The invariant `SERVICE_TOKEN_BOT2_HASH == sha256(SERVICE_TOKEN)` must hold; generate with:
   `python -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" "<token>"`

3. **Public employer access-links: no auth.** `crm/access.py` views set `authentication_classes = []`. These routes live at `/l/<uuid:token>/` (and `.../doc/<uuid>/`, `.../ask/`) — **outside `/api/v1/`**, so a reverse proxy must proxy `/l/` separately. TTL is `ACCESS_LINK_TTL_DAYS` (default 30); a GET advances lead status SENT→VIEWING and returns only employer-visible docs (CV/certificate) plus consent-gated phone.

## Server (Django) architecture

Project package `crm_server`; API is under `/api/v1/` (Django admin is at `/superadmin/`, not `/admin/`). Apps:

- `common` — `BaseModel` (UUID PK + timestamps), `ServiceToken`, pagination, service-token auth helpers, custom exception handler.
- `authn` — custom `User` (`AUTH_USER_MODEL = authn.User`, email login, `admin`/`viewer` roles), JWT login/refresh/logout/me, `RevokedToken` blacklist.
- `catalog` — reference data: `CatalogItem` (program/direction/subject/track/region/other) + `CatalogRelation`; metadata-driven "programs" view.
- `bot2` — Telegram backend: `StudentRoster`, `Bot2Student`, `Bot2StudentAccount` (multiple Telegram accounts per student), `Bot2SurveyResponse` (**append-only**, dedup via `idempotency_key`), `Bot2Document`, `ProgramEnrollment`, `BotFsmState` (DB-backed bot FSM).
- `crm` — employer-lead pipeline: `Lead`, `LeadStudent`, `AccessLink`, `AccessLog`, `FollowUp`; the public access-link and follow-up scheduling live here.
- `employers`, `vacancies` (`Vacancy` + `VacancyChannelPost` outbox for channel posting), `documents` — each has its own `urls.py`.
- `internships` — `InternshipRequest`: a student applies via the bot (picks an employer from the registry or types a company name — `company_name` is always a snapshot), staff approve/reject on the dashboard, the result is pushed back to the student as a bot message (`notifications.py`). A partial unique constraint enforces **one pending request per student** at the DB level.
- `ai_gateway` — thin httpx client (`client.py::analyze`) that POSTs document bytes (base64) to an **external** AI service at `AI_SERVICE_URL` (stub by default; `http://ai_service:8100`). Used by the `documents` upload view to auto-set VERIFIED/FLAGGED; failures leave the doc PENDING. Distinct from `ai_verification`, which calls Gemini in-process.
- `analytics` — no models; read-only reporting/coverage endpoints + xlsx export (`openpyxl`).
- `audit` — append-only `AuditLog` (`log_audit`).
- `ai_verification` — Gemini document verification (see below).

Config (`crm_server/settings.py`) is almost entirely `os.getenv`. Production (`DJANGO_DEBUG` false) **fails fast** if `SECRET_KEY` is a placeholder or if `USE_SQLITE` is on. Secure-cookie / SSL-redirect / HSTS flags default ON in production, OFF in debug. Gunicorn (`gunicorn.conf.py`) caps workers at `min(cpu*2+1, 4)` to stay under the 768 MB container limit; `preload_app=True`, `gthread` × 4 threads. Container startup (`entrypoint.sh`): migrate → collectstatic → seed **only** on an empty DB in debug → exec gunicorn.

### AI verification (`server/ai_verification/`)

Gemini 2.5 Flash via the **`google-genai`** SDK (the new one, not `google-generativeai`), lazy-imported so the app loads without the package and no-ops when `GEMINI_API_KEY` is unset. Raw file **bytes** are sent — file URLs never leave the server.

- `services.py::GeminiVerificationService.verify(...)` — the core call: MIME validation, per-doc-type prompt, `temperature=0.1`, JSON response, retry with backoff on transient 5xx/429; returns a `confidence_level` (green ≥0.75 / yellow ≥0.45 / red), `extracted_data`, `flags`, and token/cost usage.
- `orchestration.py` — workflow layer: creates a `DocumentVerification`, applies safety rules (a `name_mismatch` flag forces red), auto-sets `final_decision` (green→ACCEPTED, red→REJECTED, yellow→admin review). Has a daemon-thread async variant.
- `generation.py::generate_text(...)` — general-purpose Gemini text/JSON helper reused across AI features (employer Q&A on access-links, CV skill extraction, vacancy drafting, survey insights). Every call logs an `AIUsageLog` row (append-only) with an `operation` tag and cost from `pricing.py`.

## Scheduled jobs

`followup_cron` runs `python manage.py run_scheduler` — a long-lived loop (default 60s) that each cycle calls `close_old_connections()` then `process_followups` (sends due bilingual Telegram follow-up questions) and `post_pending_vacancies` (drains the `VacancyChannelPost` outbox to the Telegram channel). Both are also standalone `manage.py` commands.

## Bot (`bot2_service/`) architecture

aiogram 3, long-polling (deletes webhook on start; `single_instance.py` + graceful exit on Telegram `Conflict` guard against double instances). Poetry build, Python 3.11, package under `src/bot2_service/`.

- `handlers.py` — the main survey FSM; `vacancy_handlers.py` (paginated vacancy browsing — requires a completed survey, 403 otherwise) and `internship_handlers.py` (internship application flow) are separate aiogram Routers.
- `handlers.py` survey flow: verify/register (student ID + birth date → `POST /bot/verify` → consent → `POST /bot/register`), then a survey that **jumps to the first unanswered step**, pivoting on the employment yes/no question (`waiting_employment`) into employed (company/role/doc) vs. unemployed (help/CV/languages/certificate) branches, ending in `POST /bot2/surveys/submit`.
- **Append-only + restart-from-employment**: choosing "new survey" from the menu re-loads the profile, pre-fills known fields (phone/gender/region/direction/course, not re-asked), and **starts the new survey at the employment question**. Each submit creates a fresh survey record server-side; nothing is edited in place.
- FSM state is **persisted in the Django DB** (`BotFsmState` via `GET/PUT/DELETE /bot/fsm/{user_id}`), not in Redis/memory — in-progress surveys survive bot restarts. `storage.py::ApiStorage` implements aiogram's `BaseStorage` over that API, with an in-flight read cache so a `set_state` + `set_data` pair costs one GET.
- `api.py` (`CrmApiClient`, httpx) talks to `SERVER_BASE_URL` (default `.../api/v1`) with the `X-SERVICE-TOKEN` header; POSTs retry only on connection errors (never on timeout/5xx) to stay safe for non-idempotent writes. Catalogs cached 15 min (`catalog_cache.py`). Bilingual UZ/RU via `texts.py`.

## Dashboard (`dashboard/`) architecture

Next.js 16 App Router, React 19, `output: "standalone"` (Docker runs `node server.js`). Tailwind v4 (CSS-first theme in `app/globals.css`, no `tailwind.config`), shadcn/ui (new-york) + Radix, TipTap rich text, `xlsx` for import/export.

- Routes: `app/login/` (public), `app/l/[token]/` (public employer access-link page), `app/dashboard/*` (authenticated: surveys, students, ai-verifications, enrollments, internships, applications, analytics, reports, ai-costs, catalog, employers, leads, vacancies, documents). Roster import and enrollments are **tabs on the students page** (`students/roster-tab.tsx`, `import-tab.tsx`, `enrollments-tab.tsx`), not standalone routes. Route gating is in `proxy.ts`.
- `lib/api.ts` is the single API layer: base URL from `NEXT_PUBLIC_API_URL` (only env var used), DRF-shaped responses (`PaginatedResponse`, trailing slashes), grouped API objects (`authApi`, `catalogApi`, `bot2Api`, `aiVerifyApi`, `leadApi`, `vacancyApi`, …), central `apiFetch` with Bearer injection + 401 auto-refresh + Uzbek error normalization.

### Design system — "akademik & aniq"

New dashboard UI should follow the existing institutional system: the **IBM Plex** superfamily (Sans = UI, Serif = display/titles via `font-display`, Mono = IDs/eyebrows/tabular), the `components/page-header.tsx` `PageHeader` (mono uppercase eyebrow → serif title → hairline rule with a **gold accent tick**, `--accent-gold`), and gold used sparingly as the signature mark over the TTPU navy/blue palette. Reuse `PageHeader`, `status-badge`, and the `components/ui/` primitives rather than introducing new patterns.
