# LocalSaathi — Database Migration Operational Runbook

## 1. Zero-Downtime Expand/Contract Migration Methodology

To achieve continuous operation during database schema changes without downtime or lock contention, all migrations in LocalSaathi must follow the **Expand / Contract** pattern across separate releases:

```
+------------------------------------------------------------------------------------------------+
| PHASE 1: EXPAND (Release N)                                                                    |
| - Add new nullable column or new table.                                                        |
| - Deploy Application Version N that writes to BOTH old and new columns, but reads from old.    |
+------------------------------------------------------------------------------------------------+
                                               |
                                               v
+------------------------------------------------------------------------------------------------+
| PHASE 2: BACKFILL & TRANSITION (Release N+1)                                                   |
| - Backfill historic data from old column to new column via asynchronous background worker.     |
| - Deploy Application Version N+1 that reads and writes exclusively to the new column.         |
+------------------------------------------------------------------------------------------------+
                                               |
                                               v
+------------------------------------------------------------------------------------------------+
| PHASE 3: CONTRACT (Release N+2)                                                                |
| - Remove old column or table via forward migration after confirming zero reads on old field.  |
+------------------------------------------------------------------------------------------------+
```

---

## 2. Pre-Migration Safety Pipeline

Never run raw `prisma db push` against production. Every schema migration must pass through this automated pipeline:

```
[1. AUTHOR MIGRATION] ---> [2. ANALYZE SAFETY (`db:migration:safety`)]
                                            |
[4. APPLY MIGRATION]  <--- [3. VERIFY BACKUP (`db:backup:verify`)]
          |
          v
[5. AUDIT INTEGRITY (`db:integrity`)] ---> [6. CONFIRM SCHEMA]
```

1. **Safety Analysis:**
   ```bash
   npm run db:migration:safety
   ```
   * Classifies schema changes as `SAFE`, `RISKY`, or `DESTRUCTIVE`.
   * Throws `MIGRATION_SAFETY_BLOCK` if a risky/destructive change is attempted without a verified backup.
2. **Pre-Migration Backup:**
   ```bash
   npm run db:backup
   npm run db:backup:verify
   ```
3. **Execution:**
   ```bash
   npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
   ```
4. **Post-Migration Verification:**
   ```bash
   npm run db:integrity
   ```

---

## 3. Dangerous Operations & Safe Alternatives

| Dangerous Operation | Risk | Safe Zero-Downtime Alternative |
| :--- | :--- | :--- |
| `ALTER TABLE users DROP COLUMN phone;` | Immediate data loss and app breakage if old code is running. | Deprecate in code (Release 1), stop reading (Release 2), drop in Release 3. |
| `ALTER TABLE jobs ADD COLUMN rate INT NOT NULL;` | Fails because existing rows have no value; table lock. | Add as `NULLABLE`, backfill default values, add `NOT NULL` constraint with `NOT VALID` then validate. |
| `CREATE INDEX idx_job_title ON jobs(title);` | Exclusive table write lock during index creation. | Use `CREATE INDEX CONCURRENTLY idx_job_title ON jobs(title);`. |
| `ALTER TABLE users ALTER COLUMN phone TYPE INT;` | Full table rewrite and lock; potential truncation. | Add new column `phone_num INT`, dual-write, backfill, swap readers. |
