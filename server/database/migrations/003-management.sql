CREATE TABLE rental_intents(
 order_code text PRIMARY KEY,intent_hash text NOT NULL,client_key text NOT NULL,contact_key text NOT NULL,
 prefix_key text NOT NULL,start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','uncertain','pending','terminal')),
 remote_expires timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_active_contact ON rental_intents(contact_key) WHERE state<>'terminal';
CREATE INDEX rental_active_client ON rental_intents(client_key) WHERE state<>'terminal';
CREATE INDEX rental_expiry ON rental_intents(remote_expires) WHERE state='pending';
GRANT SELECT,INSERT,UPDATE ON rental_intents TO booking_web_runtime;
GRANT SELECT ON rental_intents TO dd_backup;
