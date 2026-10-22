// ==============================================================================
// LocalSaathi — Dedicated Security Test Suite: RBAC & IDOR Defense
// Phase 17: Complete Security Hardening
// ==============================================================================

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '@localsaathi/types';
import { DocumentController } from '../../trust-safety/controllers/document.controller';
import { SecurityUtils } from '../../../common/utils/security.utils';

describe('Security Test Suite: RBAC & IDOR Defense (Phase 17)', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  describe('1. Role-Based Access Control (RBAC) Boundary Enforcement', () => {
    const mockContext = (role: UserRole) => ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: '00000000-0000-0000-0000-000000000001',
            role,
          },
        }),
      }),
    });

    it('MUST DENY WORKER from accessing ADMIN-restricted routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
      const context = mockContext(UserRole.WORKER) as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('MUST DENY EMPLOYER from accessing ADMIN-restricted routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
      const context = mockContext(UserRole.EMPLOYER) as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('MUST DENY SUPPORT from accessing ADMIN financial / mutation routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
      const context = mockContext(UserRole.SUPPORT) as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('MUST ALLOW ADMIN on ADMIN-restricted routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
      const context = mockContext(UserRole.ADMIN) as any;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('MUST ALLOW MODERATOR on routes permitted to [ADMIN, MODERATOR]', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN, UserRole.MODERATOR]);
      const context = mockContext(UserRole.MODERATOR) as any;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });
  });

  describe('2. Insecure Direct Object Reference (IDOR) Document Defense', () => {
    let mockPrisma: any;
    let documentController: DocumentController;

    const workerAId = '00000000-0000-0000-0000-000000000001';
    const workerBId = '00000000-0000-0000-0000-000000000002';
    const docId = '11111111-1111-1111-1111-111111111111';

    beforeEach(() => {
      mockPrisma = {
        document: {
          findUnique: jest.fn(),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'aud-1' }),
        },
      };

      documentController = new DocumentController(mockPrisma);
    });

    it('MUST PREVENT Worker B from accessing Worker A sensitive identity documents (IDOR)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: docId,
        ownerId: workerAId, // Owned by Worker A
        type: 'GOVERNMENT_ID',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        verificationStatus: 'PENDING',
        createdAt: new Date(),
      });

      const workerBCaller: any = {
        userId: workerBId, // Caller is Worker B
        role: UserRole.WORKER,
      };

      await expect(
        documentController.getDocument(workerBCaller, docId)
      ).rejects.toThrow(ForbiddenException);
    });

    it('MUST ALLOW document owner to access own identity document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: docId,
        ownerId: workerAId,
        type: 'GOVERNMENT_ID',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        verificationStatus: 'PENDING',
        createdAt: new Date(),
      });

      const workerACaller: any = {
        userId: workerAId,
        role: UserRole.WORKER,
      };

      const result = await documentController.getDocument(workerACaller, docId);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(docId);
      expect(result.data.signedAccessToken).toBeDefined();
    });

    it('MUST ALLOW authorized ADMIN to inspect document and record audit log', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: docId,
        ownerId: workerAId,
        type: 'GOVERNMENT_ID',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        verificationStatus: 'PENDING',
        createdAt: new Date(),
      });

      const adminCaller: any = {
        userId: 'admin-uuid',
        role: UserRole.ADMIN,
      };

      const result = await documentController.getDocument(adminCaller, docId);
      expect(result.success).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DOCUMENT_ACCESSED',
            entityType: 'Document',
            entityId: docId,
          }),
        })
      );
    });
  });

  describe('3. SSRF Defense & IP Range Filtering', () => {
    it('MUST block loopback and cloud metadata endpoints from external URLs', () => {
      expect(SecurityUtils.validateUrlForSsrf('http://127.0.0.1/admin').isSafe).toBe(false);
      expect(SecurityUtils.validateUrlForSsrf('http://localhost:8080/').isSafe).toBe(false);
      expect(SecurityUtils.validateUrlForSsrf('http://169.254.169.254/latest/meta-data').isSafe).toBe(false);
      expect(SecurityUtils.validateUrlForSsrf('http://10.0.0.5/internal').isSafe).toBe(false);
      expect(SecurityUtils.validateUrlForSsrf('http://192.168.1.1/router').isSafe).toBe(false);
      expect(SecurityUtils.validateUrlForSsrf('http://172.20.0.2/container').isSafe).toBe(false);
    });

    it('MUST allow legitimate public HTTPS URLs', () => {
      expect(SecurityUtils.validateUrlForSsrf('https://api.razorpay.com/v1/payments').isSafe).toBe(true);
      expect(SecurityUtils.validateUrlForSsrf('https://www.google.com').isSafe).toBe(true);
    });
  });

  describe('4. XSS & User Input Sanitization', () => {
    it('MUST strip script and iframe tags from untrusted user content', () => {
      const malicious = 'Hello <script>alert(document.cookie)</script><iframe src="evil.com"></iframe>world!';
      const cleaned = SecurityUtils.sanitizeText(malicious);
      expect(cleaned).toBe('Hello world!');
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).not.toContain('<iframe>');
    });

    it('MUST scrub dangerous javascript: URIs', () => {
      const malicious = '<a href="javascript:steal()">Click me</a>';
      const cleaned = SecurityUtils.sanitizeText(malicious);
      expect(cleaned).not.toContain('javascript:');
    });
  });
});
