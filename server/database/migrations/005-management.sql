-- Additive worker reconciliation/retention upgrade; preserve all existing state.
ALTER TABLE rental_intents ADD COLUMN reconciled_at timestamptz NOT NULL DEFAULT 'epoch';
CREATE INDEX rental_reconciliation ON rental_intents(reconciled_at) WHERE state<>'terminal';
GRANT SELECT(intent_hash,state,updated_at,remote_expires,reconciled_at),UPDATE(reconciled_at)
 ON rental_intents TO booking_worker_runtime;
GRANT SELECT(key,expires_at),DELETE ON admission_budgets TO booking_worker_runtime;
