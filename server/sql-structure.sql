-- =========================================================
-- Turin Poly Marketing CRM (PostgreSQL) - FULL SCHEMA
-- Covers: Auth + Catalog + Bot1 + Bot2 (Roster+Survey) + Audit + Analytics functions
-- =========================================================

BEGIN;

-- (Optional) Fresh start:
-- DROP SCHEMA IF EXISTS marketing_crm CASCADE;

-- Extensions (need superuser or proper privileges)
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive emails

CREATE SCHEMA IF NOT EXISTS marketing_crm;
SET search_path TO marketing_crm, public;

-- =========================================================
-- Helpers
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Enums
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='user_role' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE user_role AS ENUM ('admin', 'viewer');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='catalog_type' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE catalog_type AS ENUM ('program', 'direction', 'subject', 'track', 'region', 'other');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='application_status' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE application_status AS ENUM ('draft', 'submitted', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='gender_type' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unknown');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='actor_type' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE actor_type AS ENUM ('user', 'service');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE t.typname='audit_action' AND n.nspname='marketing_crm'
  ) THEN
    CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'other');
  END IF;
END$$;

-- =========================================================
-- AUTH (Dashboard): admin/viewer
-- =========================================================
CREATE TABLE IF NOT EXISTS auth_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT,
  role            user_role NOT NULL DEFAULT 'viewer',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_auth_users_updated_at
BEFORE UPDATE ON auth_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional refresh tokens
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires_at ON auth_refresh_tokens(expires_at);

-- Optional: bot/service tokens for server-to-server auth
CREATE TABLE IF NOT EXISTS service_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name  TEXT NOT NULL UNIQUE,   -- 'bot1', 'bot2', 'dashboard'
  token_hash    TEXT NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- UNIVERSAL CATALOG (CRUD only here for admin)
-- =========================================================
CREATE TABLE IF NOT EXISTS catalog_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          catalog_type NOT NULL,
  code          TEXT,                 -- optional internal code
  name          TEXT NOT NULL,
  parent_id     UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_type_code UNIQUE (type, code)
);

CREATE TRIGGER trg_catalog_items_updated_at
BEFORE UPDATE ON catalog_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_catalog_items_type ON catalog_items(type);
CREATE INDEX IF NOT EXISTS idx_catalog_items_parent_id ON catalog_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_active ON catalog_items(is_active);

-- Catalog relations (optional)
CREATE TABLE IF NOT EXISTS catalog_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_item_id     UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  to_item_id       UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  relation_type    TEXT NOT NULL, -- e.g. 'program_direction', 'program_track'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_rel UNIQUE (from_item_id, to_item_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_catalog_rel_from ON catalog_relations(from_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_rel_to ON catalog_relations(to_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_rel_type ON catalog_relations(relation_type);

-- =========================================================
-- BOT1 (Applicants) + separate application tables
-- =========================================================
CREATE TABLE IF NOT EXISTS bot1_applicants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id  BIGINT UNIQUE,
  telegram_chat_id  BIGINT,
  username          TEXT,
  first_name        TEXT,
  last_name         TEXT,
  phone             TEXT,
  email             CITEXT,
  region_id         UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot1_applicants_updated_at
BEFORE UPDATE ON bot1_applicants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot1_applicants_region_id ON bot1_applicants(region_id);

-- Admissions 2026
CREATE TABLE IF NOT EXISTS bot1_admissions_2026_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES bot1_applicants(id) ON DELETE CASCADE,
  direction_id  UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  track_id      UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  status        application_status NOT NULL DEFAULT 'draft',
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot1_adm_updated_at
BEFORE UPDATE ON bot1_admissions_2026_applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot1_adm_applicant ON bot1_admissions_2026_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_bot1_adm_direction ON bot1_admissions_2026_applications(direction_id);
CREATE INDEX IF NOT EXISTS idx_bot1_adm_track ON bot1_admissions_2026_applications(track_id);
CREATE INDEX IF NOT EXISTS idx_bot1_adm_submitted ON bot1_admissions_2026_applications(submitted_at);

-- Campus Tour
CREATE TABLE IF NOT EXISTS bot1_campus_tour_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES bot1_applicants(id) ON DELETE CASCADE,
  preferred_date DATE,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        application_status NOT NULL DEFAULT 'draft',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot1_tour_updated_at
BEFORE UPDATE ON bot1_campus_tour_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot1_tour_applicant ON bot1_campus_tour_requests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_bot1_tour_submitted ON bot1_campus_tour_requests(submitted_at);

-- Foundation
CREATE TABLE IF NOT EXISTS bot1_foundation_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES bot1_applicants(id) ON DELETE CASCADE,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        application_status NOT NULL DEFAULT 'draft',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot1_foundation_updated_at
BEFORE UPDATE ON bot1_foundation_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot1_foundation_applicant ON bot1_foundation_requests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_bot1_foundation_submitted ON bot1_foundation_requests(submitted_at);

-- Polito Academy
CREATE TABLE IF NOT EXISTS bot1_polito_academy_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES bot1_applicants(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        application_status NOT NULL DEFAULT 'draft',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot1_polito_updated_at
BEFORE UPDATE ON bot1_polito_academy_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot1_polito_applicant ON bot1_polito_academy_requests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_bot1_polito_subject ON bot1_polito_academy_requests(subject_id);
CREATE INDEX IF NOT EXISTS idx_bot1_polito_submitted ON bot1_polito_academy_requests(submitted_at);

-- =========================================================
-- BOT2: STUDENT ROSTER (TOTAL / denominator)
-- =========================================================
CREATE TABLE IF NOT EXISTS student_roster (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_external_id TEXT NOT NULL UNIQUE,      -- official Student ID
  program_id         UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  course_year        SMALLINT NOT NULL CHECK (course_year BETWEEN 1 AND 4),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_student_roster_updated_at
BEFORE UPDATE ON student_roster
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_roster_program_course ON student_roster(program_id, course_year);
CREATE INDEX IF NOT EXISTS idx_roster_course_year ON student_roster(course_year);
CREATE INDEX IF NOT EXISTS idx_roster_active ON student_roster(is_active);

-- =========================================================
-- BOT2: students (telegram/profile) + survey responses (RESPONDED)
-- =========================================================
CREATE TABLE IF NOT EXISTS bot2_students (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_external_id TEXT NOT NULL UNIQUE,      -- provided by student in survey
  roster_id          UUID NOT NULL REFERENCES student_roster(id) ON DELETE RESTRICT,

  telegram_user_id   BIGINT UNIQUE,
  username           TEXT,
  first_name         TEXT,
  last_name          TEXT,
  gender             gender_type NOT NULL DEFAULT 'unknown',
  phone              TEXT,
  region_id          UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot2_students_updated_at
BEFORE UPDATE ON bot2_students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot2_students_roster_id ON bot2_students(roster_id);
CREATE INDEX IF NOT EXISTS idx_bot2_students_region_id ON bot2_students(region_id);

-- Guard: bot2_students.student_external_id must exist in roster and match roster_id
CREATE OR REPLACE FUNCTION bot2_students_sync_roster()
RETURNS trigger AS $$
DECLARE v_roster_id UUID;
BEGIN
  IF NEW.student_external_id IS NULL THEN
    RAISE EXCEPTION 'student_external_id is required';
  END IF;

  SELECT id INTO v_roster_id
  FROM student_roster
  WHERE student_external_id = NEW.student_external_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster not found for student_external_id=%', NEW.student_external_id;
  END IF;

  NEW.roster_id := v_roster_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bot2_students_sync_roster ON bot2_students;
CREATE TRIGGER trg_bot2_students_sync_roster
BEFORE INSERT OR UPDATE OF student_external_id ON bot2_students
FOR EACH ROW EXECUTE FUNCTION bot2_students_sync_roster();

-- Survey responses
CREATE TABLE IF NOT EXISTS bot2_survey_responses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES bot2_students(id) ON DELETE CASCADE,
  roster_id          UUID NOT NULL REFERENCES student_roster(id) ON DELETE RESTRICT,

  -- Denormalized (auto-synced from roster for analytics speed + consistency)
  program_id         UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  course_year        SMALLINT NOT NULL CHECK (course_year BETWEEN 1 AND 4),

  is_employed        BOOLEAN,
  company_name       TEXT,
  job_title          TEXT,
  improvement_suggestions TEXT,
  needs_job_help     BOOLEAN,
  consent_share_with_employers BOOLEAN,

  survey_campaign    TEXT NOT NULL DEFAULT 'default', -- allows multiple campaigns later
  answers            JSONB NOT NULL DEFAULT '{}'::jsonb,

  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_roster_campaign UNIQUE (roster_id, survey_campaign)
);

CREATE TRIGGER trg_bot2_survey_updated_at
BEFORE UPDATE ON bot2_survey_responses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bot2_survey_student ON bot2_survey_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_bot2_survey_roster ON bot2_survey_responses(roster_id);
CREATE INDEX IF NOT EXISTS idx_bot2_survey_program ON bot2_survey_responses(program_id);
CREATE INDEX IF NOT EXISTS idx_bot2_survey_course_year ON bot2_survey_responses(course_year);
CREATE INDEX IF NOT EXISTS idx_bot2_survey_submitted ON bot2_survey_responses(submitted_at);
CREATE INDEX IF NOT EXISTS idx_bot2_survey_campaign ON bot2_survey_responses(survey_campaign);

-- Guard: survey responses must always reflect roster program/course_year
CREATE OR REPLACE FUNCTION bot2_survey_sync_program_course()
RETURNS trigger AS $$
DECLARE v_program UUID;
DECLARE v_course SMALLINT;
BEGIN
  IF NEW.roster_id IS NULL THEN
    RAISE EXCEPTION 'roster_id is required on survey response';
  END IF;

  SELECT program_id, course_year INTO v_program, v_course
  FROM student_roster
  WHERE id = NEW.roster_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster not found for roster_id=%', NEW.roster_id;
  END IF;

  NEW.program_id := v_program;
  NEW.course_year := v_course;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bot2_survey_sync_program_course ON bot2_survey_responses;
CREATE TRIGGER trg_bot2_survey_sync_program_course
BEFORE INSERT OR UPDATE OF roster_id ON bot2_survey_responses
FOR EACH ROW EXECUTE FUNCTION bot2_survey_sync_program_course();

-- =========================================================
-- AUDIT LOGS (CRUD + auth)
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  actor_type    actor_type NOT NULL,
  actor_user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  actor_service TEXT, -- 'bot1', 'bot2', 'server'

  action        audit_action NOT NULL,
  entity_table  TEXT NOT NULL,
  entity_id     UUID,
  before_data   JSONB,
  after_data    JSONB,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,

  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- =========================================================
-- ANALYTICS FUNCTIONS (time range mandatory)
-- =========================================================

-- Bot2: Course year TOTAL vs RESPONDED
CREATE OR REPLACE FUNCTION fn_bot2_course_year_coverage(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ,
  p_campaign TEXT DEFAULT 'default'
)
RETURNS TABLE (
  course_year SMALLINT,
  total_students BIGINT,
  responded_students BIGINT,
  coverage_percent NUMERIC
) AS $$
WITH totals AS (
  SELECT course_year, COUNT(*) total
  FROM student_roster
  WHERE is_active = TRUE
  GROUP BY course_year
),
responded AS (
  SELECT r.course_year, COUNT(DISTINCT s.roster_id) responded
  FROM bot2_survey_responses s
  JOIN student_roster r ON r.id = s.roster_id
  WHERE s.submitted_at >= p_from AND s.submitted_at < p_to
    AND s.survey_campaign = p_campaign
  GROUP BY r.course_year
)
SELECT
  y.course_year,
  COALESCE(t.total, 0) AS total_students,
  COALESCE(resp.responded, 0) AS responded_students,
  CASE WHEN COALESCE(t.total,0) = 0 THEN 0
       ELSE ROUND((COALESCE(resp.responded,0)::numeric / t.total) * 100, 2)
  END AS coverage_percent
FROM (SELECT generate_series(1,4)::SMALLINT AS course_year) y
LEFT JOIN totals t ON t.course_year = y.course_year
LEFT JOIN responded resp ON resp.course_year = y.course_year
ORDER BY y.course_year;
$$ LANGUAGE sql STABLE;

-- Bot2: Program TOTAL vs RESPONDED (optionally for a course_year)
CREATE OR REPLACE FUNCTION fn_bot2_program_coverage(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ,
  p_course_year SMALLINT DEFAULT NULL,
  p_campaign TEXT DEFAULT 'default'
)
RETURNS TABLE (
  program_id UUID,
  program_name TEXT,
  total_students BIGINT,
  responded_students BIGINT,
  coverage_percent NUMERIC
) AS $$
WITH totals AS (
  SELECT program_id, COUNT(*) total
  FROM student_roster
  WHERE is_active = TRUE
    AND (p_course_year IS NULL OR course_year = p_course_year)
  GROUP BY program_id
),
responded AS (
  SELECT r.program_id, COUNT(DISTINCT s.roster_id) responded
  FROM bot2_survey_responses s
  JOIN student_roster r ON r.id = s.roster_id
  WHERE s.submitted_at >= p_from AND s.submitted_at < p_to
    AND s.survey_campaign = p_campaign
    AND (p_course_year IS NULL OR r.course_year = p_course_year)
  GROUP BY r.program_id
)
SELECT
  t.program_id,
  p.name AS program_name,
  COALESCE(t.total, 0) AS total_students,
  COALESCE(resp.responded, 0) AS responded_students,
  CASE WHEN COALESCE(t.total,0) = 0 THEN 0
       ELSE ROUND((COALESCE(resp.responded,0)::numeric / t.total) * 100, 2)
  END AS coverage_percent
FROM totals t
LEFT JOIN catalog_items p ON p.id = t.program_id
LEFT JOIN responded resp ON resp.program_id = t.program_id
ORDER BY program_name NULLS LAST;
$$ LANGUAGE sql STABLE;

-- Bot2: Program x Course matrix (TOTAL vs RESPONDED)
CREATE OR REPLACE FUNCTION fn_bot2_program_course_matrix(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ,
  p_campaign TEXT DEFAULT 'default'
)
RETURNS TABLE (
  program_id UUID,
  program_name TEXT,
  course_year SMALLINT,
  total_students BIGINT,
  responded_students BIGINT,
  coverage_percent NUMERIC
) AS $$
WITH totals AS (
  SELECT program_id, course_year, COUNT(*) total
  FROM student_roster
  WHERE is_active = TRUE
  GROUP BY program_id, course_year
),
responded AS (
  SELECT r.program_id, r.course_year, COUNT(DISTINCT s.roster_id) responded
  FROM bot2_survey_responses s
  JOIN student_roster r ON r.id = s.roster_id
  WHERE s.submitted_at >= p_from AND s.submitted_at < p_to
    AND s.survey_campaign = p_campaign
  GROUP BY r.program_id, r.course_year
)
SELECT
  t.program_id,
  p.name AS program_name,
  t.course_year,
  COALESCE(t.total, 0) AS total_students,
  COALESCE(resp.responded, 0) AS responded_students,
  CASE WHEN COALESCE(t.total,0) = 0 THEN 0
       ELSE ROUND((COALESCE(resp.responded,0)::numeric / t.total) * 100, 2)
  END AS coverage_percent
FROM totals t
LEFT JOIN catalog_items p ON p.id = t.program_id
LEFT JOIN responded resp
  ON resp.program_id = t.program_id AND resp.course_year = t.course_year
ORDER BY program_name NULLS LAST, t.course_year;
$$ LANGUAGE sql STABLE;

-- Bot1 analytics helpers (optional but useful)
CREATE OR REPLACE FUNCTION fn_bot1_admissions_by_direction(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  direction_id UUID,
  direction_name TEXT,
  total BIGINT
) AS $$
SELECT
  a.direction_id,
  c.name AS direction_name,
  COUNT(*) AS total
FROM bot1_admissions_2026_applications a
LEFT JOIN catalog_items c ON c.id = a.direction_id
WHERE a.submitted_at >= p_from AND a.submitted_at < p_to
GROUP BY a.direction_id, c.name
ORDER BY total DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_bot1_admissions_by_track(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  track_id UUID,
  track_name TEXT,
  total BIGINT
) AS $$
SELECT
  a.track_id,
  c.name AS track_name,
  COUNT(*) AS total
FROM bot1_admissions_2026_applications a
LEFT JOIN catalog_items c ON c.id = a.track_id
WHERE a.submitted_at >= p_from AND a.submitted_at < p_to
GROUP BY a.track_id, c.name
ORDER BY total DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_bot1_polito_by_subject(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  total BIGINT
) AS $$
SELECT
  r.subject_id,
  c.name AS subject_name,
  COUNT(*) AS total
FROM bot1_polito_academy_requests r
LEFT JOIN catalog_items c ON c.id = r.subject_id
WHERE r.submitted_at >= p_from AND r.submitted_at < p_to
GROUP BY r.subject_id, c.name
ORDER BY total DESC;
$$ LANGUAGE sql STABLE;

COMMIT;
