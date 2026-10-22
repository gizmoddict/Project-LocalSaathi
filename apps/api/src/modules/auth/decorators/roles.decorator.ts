import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@localsaathi/types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to enforce server-side Role-Based Access Control (RBAC).
 * Supports WORKER, EMPLOYER, ADMIN, MODERATOR, SUPPORT.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
