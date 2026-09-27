CREATE TABLE marketing_subscriptions(
 email text PRIMARY KEY,status text NOT NULL CHECK(status IN ('pending','active','unsubscribed','suppressed')),
 consent_version text NOT NULL,source text NOT NULL,language text NOT NULL CHECK(language IN ('da','en')),
 requested_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,unsubscribed_at timestamptz
);
CREATE TABLE marketing_action_tokens(token_hash text PRIMARY KEY,email text NOT NULL REFERENCES marketing_subscriptions(email) ON DELETE CASCADE,purpose text NOT NULL CHECK(purpose IN ('confirm','unsubscribe')),expires_at timestamptz NOT NULL);
CREATE INDEX marketing_tokens_expiry ON marketing_action_tokens(expires_at);
CREATE TABLE internal_requests(key text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE deliveries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, identity text UNIQUE NOT NULL, kind text NOT NULL,
 payload text, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','sending','sent','permanent','ambiguous')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz, next_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_due ON deliveries(next_at) WHERE state='queued';
CREATE TABLE delivery_attempts (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,delivery_id bigint NOT NULL REFERENCES deliveries(id),attempt integer NOT NULL,outcome text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE abuse_limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
