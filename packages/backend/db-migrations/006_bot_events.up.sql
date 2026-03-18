CREATE TABLE IF NOT EXISTS bot_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type bot_event_type NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_events_type_ts ON bot_events (event_type, timestamp DESC);
CREATE INDEX idx_bot_events_ts ON bot_events (timestamp DESC);
