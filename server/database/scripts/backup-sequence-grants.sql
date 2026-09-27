\connect marketing
BEGIN;
SET ROLE primary_marketing_migrator;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA primary_marketing TO dd_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA primary_marketing GRANT SELECT ON SEQUENCES TO dd_backup;
RESET ROLE;
SET ROLE booking_marketing_migrator;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA booking_marketing TO dd_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA booking_marketing GRANT SELECT ON SEQUENCES TO dd_backup;
RESET ROLE;
COMMIT;
\connect booking_management
BEGIN;
SET ROLE booking_management_migrator;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO dd_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO dd_backup;
RESET ROLE;
COMMIT;
\connect pretix
BEGIN;
SET ROLE pretix_migrator;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO dd_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO dd_backup;
RESET ROLE;
COMMIT;
