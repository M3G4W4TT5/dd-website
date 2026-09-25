-- Apply to a separate application database and role, never the pretix database.
CREATE TABLE IF NOT EXISTS marketing_subscriptions (
  list text NOT NULL CHECK (list IN ('personal', 'booking')),
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  consent_version text NOT NULL,
  source text NOT NULL,
  language text NOT NULL CHECK (language IN ('da', 'en')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  PRIMARY KEY (list, email)
);

CREATE TABLE IF NOT EXISTS marketing_action_tokens (
  token_hash text PRIMARY KEY,
  list text NOT NULL,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('confirm', 'unsubscribe')),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (list, email) REFERENCES marketing_subscriptions (list, email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS marketing_action_tokens_expires_at_idx ON marketing_action_tokens (expires_at);
