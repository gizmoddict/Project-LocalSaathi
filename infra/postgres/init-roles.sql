-- ==============================================================================
-- LocalSaathi Production Database Role Separation (Least Privilege)
-- Separates: app_user (DML only), migration_user (DDL), backup_user (Read-Only)
-- ==============================================================================

-- 1. Create Migration Admin Role (Used only during deployment pipelines)
CREATE ROLE migration_user WITH LOGIN PASSWORD 'REPLACE_IN_PROD_MIGRATION_PASSWORD';
GRANT CONNECT ON DATABASE localsaathi_db TO migration_user;
GRANT CREATE, USAGE ON SCHEMA public TO migration_user;

-- 2. Create Application Runtime Role (Used by API and Worker containers)
CREATE ROLE app_user WITH LOGIN PASSWORD 'REPLACE_IN_PROD_APP_PASSWORD';
GRANT CONNECT ON DATABASE localsaathi_db TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Grant DML privileges on existing tables to app_user (NO DROP or TRUNCATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Automatically grant DML on future tables created by migration_user
ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

-- 3. Create Backup & Disaster Recovery Role (Read-Only)
CREATE ROLE backup_user WITH LOGIN PASSWORD 'REPLACE_IN_PROD_BACKUP_PASSWORD';
GRANT CONNECT ON DATABASE localsaathi_db TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT SELECT ON TABLES TO backup_user;
