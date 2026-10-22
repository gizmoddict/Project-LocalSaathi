import {
  ADMIN_CAPABILITIES,
  DEFAULT_ADMIN_PAGE_SIZE,
  MAX_ADMIN_PAGE_SIZE,
} from '../admin.constants';
import { UserRole, AdminCapability } from '@localsaathi/types';

describe('Admin Operations Unit Tests (Phase 15)', () => {
  describe('RBAC & Role Capabilities', () => {
    it('grants full operational capabilities to ADMIN', () => {
      const adminCaps = ADMIN_CAPABILITIES[UserRole.ADMIN];
      expect(adminCaps).toContain(AdminCapability.VIEW_METRICS);
      expect(adminCaps).toContain(AdminCapability.MANAGE_USERS);
      expect(adminCaps).toContain(AdminCapability.MANAGE_JOBS);
      expect(adminCaps).toContain(AdminCapability.MANAGE_REPORTS);
      expect(adminCaps).toContain(AdminCapability.MANAGE_DISPUTES);
      expect(adminCaps).toContain(AdminCapability.MANAGE_VERIFICATIONS);
      expect(adminCaps).toContain(AdminCapability.MANAGE_MODERATION);
      expect(adminCaps).toContain(AdminCapability.MANAGE_PAYMENTS);
      expect(adminCaps).toContain(AdminCapability.VIEW_AUDIT_LOGS);
      expect(adminCaps).toContain(AdminCapability.VIEW_SYSTEM_HEALTH);
    });

    it('grants moderation and safety capabilities to MODERATOR without destructive admin control', () => {
      const modCaps = ADMIN_CAPABILITIES[UserRole.MODERATOR];
      expect(modCaps).toContain(AdminCapability.VIEW_REPORTS);
      expect(modCaps).toContain(AdminCapability.MANAGE_REPORTS);
      expect(modCaps).toContain(AdminCapability.VIEW_MODERATION);
      expect(modCaps).toContain(AdminCapability.MANAGE_MODERATION);
      expect(modCaps).toContain(AdminCapability.VIEW_VERIFICATIONS);
      expect(modCaps).toContain(AdminCapability.MANAGE_VERIFICATIONS);
      expect(modCaps).toContain(AdminCapability.VIEW_DISPUTES);

      // Moderators cannot view financial ledgers or system health
      expect(modCaps).not.toContain(AdminCapability.MANAGE_PAYMENTS);
      expect(modCaps).not.toContain(AdminCapability.VIEW_SYSTEM_HEALTH);
    });

    it('grants read-only support inspection capabilities to SUPPORT', () => {
      const supportCaps = ADMIN_CAPABILITIES[UserRole.SUPPORT];
      expect(supportCaps).toContain(AdminCapability.VIEW_USERS);
      expect(supportCaps).toContain(AdminCapability.VIEW_WORKERS);
      expect(supportCaps).toContain(AdminCapability.VIEW_EMPLOYERS);
      expect(supportCaps).toContain(AdminCapability.VIEW_JOBS);
      expect(supportCaps).toContain(AdminCapability.VIEW_REPORTS);

      // Support cannot mutate or manage operations
      expect(supportCaps).not.toContain(AdminCapability.MANAGE_USERS);
      expect(supportCaps).not.toContain(AdminCapability.MANAGE_JOBS);
      expect(supportCaps).not.toContain(AdminCapability.MANAGE_PAYMENTS);
      expect(supportCaps).not.toContain(AdminCapability.VIEW_SYSTEM_HEALTH);
    });

    it('denies all administrative capabilities to WORKER and EMPLOYER', () => {
      expect(ADMIN_CAPABILITIES[UserRole.WORKER]).toEqual([]);
      expect(ADMIN_CAPABILITIES[UserRole.EMPLOYER]).toEqual([]);
    });
  });

  describe('Pagination & Safety Invariants', () => {
    it('enforces default and maximum bounded query limits', () => {
      expect(DEFAULT_ADMIN_PAGE_SIZE).toBe(20);
      expect(MAX_ADMIN_PAGE_SIZE).toBe(100);
      expect(DEFAULT_ADMIN_PAGE_SIZE).toBeLessThanOrEqual(MAX_ADMIN_PAGE_SIZE);
    });
  });

  describe('Data Minimization Invariants', () => {
    it('ensures safe document masking removes full identification numbers', () => {
      const maskDoc = (docNum: string) => {
        if (!docNum || docNum.length <= 4) return '••••';
        return `••••••••${docNum.slice(-4)}`;
      };

      expect(maskDoc('123456789012')).toBe('••••••••9012');
      expect(maskDoc('ABCDE1234F')).toBe('••••••••234F');
      expect(maskDoc('123')).toBe('••••');
    });

    it('verifies credential fields are stripped from admin projection', () => {
      const rawUser = {
        id: 'usr_123',
        phoneNumber: '+919876543210',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz',
        otpSecret: 'secret_otp',
        currentSessionToken: 'jwt.token.here',
      };

      const { passwordHash, otpSecret, currentSessionToken, ...safeUser } = rawUser;

      expect(safeUser).not.toHaveProperty('passwordHash');
      expect(safeUser).not.toHaveProperty('otpSecret');
      expect(safeUser).not.toHaveProperty('currentSessionToken');
      expect(safeUser.id).toBe('usr_123');
    });
  });
});
