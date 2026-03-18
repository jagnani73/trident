CREATE TYPE position_type AS ENUM ('spread', 'basis');
CREATE TYPE position_status AS ENUM ('open', 'closed');
CREATE TYPE strategy_layer AS ENUM ('lending', 'spread', 'basis', 'idle');
CREATE TYPE bot_event_type AS ENUM (
    'tick',
    'open_position',
    'close_position',
    'rebalance',
    'emergency_exit',
    'error'
);
CREATE TYPE close_reason AS ENUM (
    'target_hit',
    'stop_loss',
    'max_age',
    'funding_flip',
    'emergency_exit',
    'manual'
);
