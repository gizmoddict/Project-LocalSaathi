-- Phase 17: Complete Security Hardening — Audit Log Immutability
-- Enforce database-level append-only immutability on audit_logs table.
-- Any UPDATE or DELETE statement targeting audit_logs will raise an exception.

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Security Policy Violation: audit_logs records are strictly immutable. UPDATE and DELETE are prohibited.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
