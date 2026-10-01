-- Campus Laboratory Booking — database schema (Phase 1)
-- Applied automatically on first container start via /docker-entrypoint-initdb.d.

-- pgcrypto provides gen_salt()/crypt() so seed passwords can be hashed with
-- bcrypt entirely inside the database (no host tooling required).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student', 'technician', 'admin')),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side store for the RC4 session keys issued by POST /api/session/key
-- (wired up in Phase 2). The key is handed to the client as Base64 in readable
-- JSON over plain HTTP — that exposure is a documented protocol weakness.
CREATE TABLE rc4_sessions (
  session_id TEXT PRIMARY KEY,
  key_b64    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Synthetic dummy secrets. The field-service row mirrors the token that will
-- be packaged inside the Electron app for lab vulnerability V1 (Phase 5/7).
CREATE TABLE service_secrets (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  note  TEXT
);

CREATE TABLE locations (
  id       SERIAL PRIMARY KEY,
  building TEXT NOT NULL,
  room     TEXT NOT NULL,
  label    TEXT NOT NULL
);

CREATE TABLE equipment (
  id                SERIAL PRIMARY KEY,
  asset_tag         TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  location_id       INT NOT NULL REFERENCES locations (id),
  status            TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'maintenance', 'retired')),
  firmware_version  TEXT,
  diagnostic_target TEXT,
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id           SERIAL PRIMARY KEY,
  equipment_id INT NOT NULL REFERENCES equipment (id),
  user_id      INT NOT NULL REFERENCES users (id),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  purpose      TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fault_reports (
  id           SERIAL PRIMARY KEY,
  equipment_id INT NOT NULL REFERENCES equipment (id),
  reported_by  INT NOT NULL REFERENCES users (id),
  title        TEXT NOT NULL,
  description  TEXT,
  severity     TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_runs (
  id            SERIAL PRIMARY KEY,
  equipment_id  INT NOT NULL REFERENCES equipment (id),
  requested_by  INT REFERENCES users (id),
  kind          TEXT NOT NULL,
  target        TEXT,
  request_body  TEXT,
  response_body TEXT,
  status        TEXT NOT NULL,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            SERIAL PRIMARY KEY,
  actor_user_id INT REFERENCES users (id),
  actor_label   TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     INT,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
