-- Additive upgrade; no operational state is deleted.
CREATE TABLE admission_budgets(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX admission_budgets_expiry ON admission_budgets(expires_at);
CREATE TABLE admission_emergency(key text PRIMARY KEY,tokens numeric NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE admission_leases(id uuid PRIMARY KEY,lane text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX admission_leases_lane ON admission_leases(lane,expires_at);
ALTER TABLE deliveries ADD COLUMN admission_client text;
CREATE INDEX recovery_outstanding ON deliveries(admission_client) WHERE kind='recovery' AND state IN ('queued','leased','sending');
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_budgets,admission_emergency,admission_leases TO booking_web_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_leases TO booking_worker_runtime;
GRANT SELECT ON admission_budgets,admission_emergency,admission_leases TO dd_backup;
