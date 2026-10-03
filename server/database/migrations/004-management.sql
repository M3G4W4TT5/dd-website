-- Additive indexes only; existing inbox runtime/backup privileges remain unchanged.
CREATE INDEX webhook_inbox_due ON webhook_inbox(next_at,created_at) WHERE state='queued';
CREATE INDEX webhook_inbox_terminal_age ON webhook_inbox(created_at) WHERE state IN ('processed','ignored');
