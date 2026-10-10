-- Dates are calendar dates stored as 'YYYY-MM-DD' text, so lexical order equals
-- chronological order and no time-zone conversion is ever involved.
-- Money is stored as integer minor units (cents) to avoid floating-point drift.

CREATE TABLE categories (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL UNIQUE,
    color_hex   TEXT NOT NULL DEFAULT '#10b981',
    created_at  TEXT NOT NULL
);

CREATE TABLE rules (
    id                  TEXT PRIMARY KEY NOT NULL,
    category_id         TEXT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('CONTAINS', 'REGEX')),
    pattern             TEXT NOT NULL,
    is_case_insensitive INTEGER NOT NULL DEFAULT 1 CHECK (is_case_insensitive IN (0, 1)),
    priority            INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL
);

CREATE INDEX idx_rules_priority ON rules (priority);
CREATE INDEX idx_rules_category ON rules (category_id);

CREATE TABLE transactions (
    id            TEXT PRIMARY KEY NOT NULL,
    -- SHA-256 of 'isoDate__amount__description'; the deduplication key for imports.
    hash          TEXT NOT NULL UNIQUE,
    date          TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    description   TEXT NOT NULL,
    amount_cents  INTEGER NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'EUR',
    category_id   TEXT REFERENCES categories (id) ON DELETE SET NULL
);

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_category ON transactions (category_id);
