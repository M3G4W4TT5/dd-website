CREATE TABLE IF NOT EXISTS manage_link_requests (
  email_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL
);

CREATE INDEX IF NOT EXISTS manage_link_requests_window_start_idx ON manage_link_requests (window_start);

CREATE TABLE IF NOT EXISTS manage_link_tokens (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS manage_link_tokens_expires_at_idx ON manage_link_tokens (expires_at);

CREATE TABLE IF NOT EXISTS manage_sessions (
  session_hash text PRIMARY KEY,
  email text NOT NULL,
  order_codes text[] NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS manage_sessions_expires_at_idx ON manage_sessions (expires_at);

CREATE TABLE webhook_inbox(notification_id text PRIMARY KEY,organizer text NOT NULL,event text NOT NULL,code text NOT NULL,action text NOT NULL,state text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE operations(id uuid PRIMARY KEY,order_code text NOT NULL,kind text NOT NULL CHECK(kind IN ('change','cancel')),before_state jsonb NOT NULL,target jsonb NOT NULL,state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','submitted','verified','rejected','ambiguous')),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX unresolved_order_operation ON operations(order_code) WHERE state IN ('prepared','submitted','ambiguous');
CREATE TABLE order_snapshots(order_code text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1,state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE deliveries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, identity text UNIQUE NOT NULL, kind text NOT NULL,
 payload text, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','sending','sent','permanent','ambiguous')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz, next_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_due ON deliveries(next_at) WHERE state='queued';
CREATE TABLE delivery_attempts (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,delivery_id bigint NOT NULL REFERENCES deliveries(id),attempt integer NOT NULL,outcome text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE abuse_limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
