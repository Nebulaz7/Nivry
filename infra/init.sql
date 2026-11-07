-- Nivry PostgreSQL Initial Schema (PLAN.md §13)
-- All yoctoNEAR quantities stored as NUMERIC(39, 0) to avoid JS floating point truncation.

CREATE TABLE IF NOT EXISTS agents (
    token_id VARCHAR(64) PRIMARY KEY,
    owner_id VARCHAR(64) NOT NULL,
    treasury_account_id VARCHAR(64) NOT NULL,
    authority_epoch BIGINT NOT NULL,
    ownership_change_count BIGINT NOT NULL,
    lifecycle VARCHAR(32) NOT NULL,
    frozen BOOLEAN NOT NULL DEFAULT FALSE,
    manifest_hash VARCHAR(64) NOT NULL,
    manifest JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    block_height BIGINT NOT NULL,
    block_timestamp_ns NUMERIC(20, 0) NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    receipt_id VARCHAR(64) NOT NULL,
    log_index INT NOT NULL,
    token_id VARCHAR(64),
    event_standard VARCHAR(32) NOT NULL,
    event_version VARCHAR(16) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    authority_epoch BIGINT,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_event_log UNIQUE (receipt_id, log_index)
);

CREATE INDEX IF NOT EXISTS idx_events_token_id ON events (token_id);
CREATE INDEX IF NOT EXISTS idx_events_block_height ON events (block_height);

CREATE TABLE IF NOT EXISTS listings (
    listing_id VARCHAR(64) PRIMARY KEY,
    token_id VARCHAR(64) NOT NULL,
    seller_id VARCHAR(64) NOT NULL,
    authority_epoch BIGINT NOT NULL,
    price_yocto NUMERIC(39, 0) NOT NULL,
    manifest_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_listings_token_id ON listings (token_id);

CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(64) PRIMARY KEY,
    token_id VARCHAR(64) NOT NULL,
    task_kind VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_token_id ON tasks (token_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

CREATE TABLE IF NOT EXISTS operation_projections (
    operation_id VARCHAR(64) PRIMARY KEY,
    token_id VARCHAR(64) NOT NULL,
    sequence BIGINT NOT NULL,
    authority_epoch BIGINT NOT NULL,
    kind VARCHAR(32) NOT NULL,
    recipient VARCHAR(64) NOT NULL,
    amount_yocto NUMERIC(39, 0) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operations_token_id ON operation_projections (token_id);

CREATE TABLE IF NOT EXISTS ingestion_cursors (
    source_name VARCHAR(64) PRIMARY KEY,
    last_processed_block_height BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_challenges (
    challenge_id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

