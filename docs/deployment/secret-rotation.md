# LocalSaathi — Secret Rotation Procedures

## 1. Dual-Key Rotation Principle

To rotate cryptographic keys and secrets without terminating active user sessions, breaking ongoing payments, or dropping webhook deliveries, LocalSaathi implements **Dual-Key Rotation**:

$$\text{SIGNING} = \text{Primary Secret (New Key)}$$
$$\text{VERIFICATION} = \text{Primary Secret} \lor \text{Previous Secret (Old Key)}$$

---

## 2. JWT Access & Refresh Token Secret Rotation

### Step 1: Deploy with Dual-Key Verification
1. Generate a new cryptographic key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update environment configuration in Secrets Manager:
   * Set `JWT_PREVIOUS_ACCESS_SECRET` to current `JWT_ACCESS_SECRET`.
   * Set `JWT_ACCESS_SECRET` to the newly generated key.
3. Deploy API instances.
4. **Behavior:**
   * New tokens issued are signed using the new key.
   * Incoming tokens signed with the old key continue to verify successfully during the 15-minute token TTL window.

### Step 2: Retire Previous Key
1. Wait for token expiration window ($15\text{ minutes} + 5\text{ minutes grace}$).
2. Clear `JWT_PREVIOUS_ACCESS_SECRET`.
3. Deploy API instances.

---

## 3. Payment Gateway Webhook Secret Rotation (Razorpay)

1. Generate a new webhook secret in Razorpay Merchant Dashboard.
2. Configure environment:
   * `RAZORPAY_PREVIOUS_WEBHOOK_SECRET` = Old Secret.
   * `RAZORPAY_WEBHOOK_SECRET` = New Secret.
3. Deploy API instances.
4. Verify signature validation: API checks primary secret first; if invalid, checks previous secret.
5. Save the new webhook secret in Razorpay Dashboard.
6. Once all incoming webhooks use the new secret, remove `RAZORPAY_PREVIOUS_WEBHOOK_SECRET`.

---

## 4. Database Password Rotation

1. Create a secondary application user in PostgreSQL:
   ```sql
   CREATE ROLE app_user_v2 WITH LOGIN PASSWORD 'new_secure_password';
   GRANT app_user TO app_user_v2;
   ```
2. Update `DATABASE_URL` in Secrets Manager to use `app_user_v2`.
3. Execute rolling restart of API and Worker containers.
4. Verify connections are healthy via `/health/ready`.
5. Revoke and drop old role:
   ```sql
   DROP ROLE app_user;
   ```

---

## 5. Backup Encryption Key Rotation

1. Backups created with the previous key remain verifiable and restorable by providing `--encryption-key <OLD_KEY>`.
2. Update `BACKUP_ENCRYPTION_KEY` in environment.
3. Trigger a fresh backup:
   ```bash
   npm run db:backup
   npm run db:backup:verify
   ```
4. Confirm the new backup verifies with the new key.
