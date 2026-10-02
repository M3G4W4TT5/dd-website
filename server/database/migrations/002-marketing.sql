CREATE TABLE admission_budgets(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX admission_budgets_expiry ON admission_budgets(expires_at);
CREATE TABLE admission_emergency(key text PRIMARY KEY,tokens numeric NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE admission_leases(id uuid PRIMARY KEY,lane text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX admission_leases_lane ON admission_leases(lane,expires_at);
-- In each fixed marketing schema, grant only its matching runtime.
DO $$ DECLARE runtime_role text; BEGIN
 runtime_role := CASE current_schema() WHEN 'primary_marketing' THEN 'primary_marketing_runtime' WHEN 'booking_marketing' THEN 'booking_marketing_runtime' ELSE NULL END;
 IF runtime_role IS NOT NULL THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON admission_budgets,admission_emergency,admission_leases TO %I',runtime_role);
 END IF;
END $$;
GRANT SELECT ON admission_budgets,admission_emergency,admission_leases TO dd_backup;
CREATE INDEX marketing_pending_age ON marketing_subscriptions(requested_at) WHERE status='pending';
CREATE INDEX marketing_terminal_age ON deliveries(created_at) WHERE state IN ('sent','permanent');
-- Preserve consent/withdrawal evidence across re-opt-in and eligible pending cleanup.
CREATE TABLE marketing_consent_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL,status text NOT NULL,
 consent_version text NOT NULL,source text NOT NULL,language text NOT NULL,
 confirmed_at timestamptz,unsubscribed_at timestamptz,recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_history_email ON marketing_consent_history(email);
INSERT INTO marketing_consent_history(email,status,consent_version,source,language,confirmed_at,unsubscribed_at)
 SELECT email,status,consent_version,source,language,confirmed_at,unsubscribed_at FROM marketing_subscriptions WHERE status IN ('active','unsubscribed','suppressed');
CREATE FUNCTION record_marketing_consent() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
 BEGIN
  IF NEW.status IN ('active','unsubscribed','suppressed') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.consent_version IS DISTINCT FROM NEW.consent_version) THEN
   INSERT INTO marketing_consent_history(email,status,consent_version,source,language,confirmed_at,unsubscribed_at)
    VALUES(NEW.email,NEW.status,NEW.consent_version,NEW.source,NEW.language,NEW.confirmed_at,NEW.unsubscribed_at);
  END IF;
  RETURN NEW;
 END $$;
CREATE TRIGGER marketing_consent_audit AFTER INSERT OR UPDATE ON marketing_subscriptions FOR EACH ROW EXECUTE FUNCTION record_marketing_consent();
DO $$ DECLARE runtime_role text; BEGIN
 runtime_role := CASE current_schema() WHEN 'primary_marketing' THEN 'primary_marketing_runtime' WHEN 'booking_marketing' THEN 'booking_marketing_runtime' ELSE NULL END;
 IF runtime_role IS NOT NULL THEN
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON marketing_consent_history FROM %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT ON marketing_consent_history TO %I',runtime_role);
 END IF;
END $$;
GRANT SELECT ON marketing_consent_history TO dd_backup;

-- Preserve the separate lane for already queued withdrawal messages.
UPDATE deliveries SET kind='marketing-withdrawal' WHERE kind='marketing' AND identity LIKE '%:unsubscribe:%';

DO $$ DECLARE operator_role text; BEGIN
 operator_role := CASE current_schema() WHEN 'primary_marketing' THEN 'primary_marketing_operator' WHEN 'booking_marketing' THEN 'booking_marketing_operator' ELSE NULL END;
 IF operator_role IS NOT NULL THEN EXECUTE format('GRANT SELECT,INSERT ON marketing_consent_history TO %I',operator_role); END IF;
END $$;
