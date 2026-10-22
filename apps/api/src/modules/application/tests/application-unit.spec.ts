import { ApplicationStatus } from '@localsaathi/types';
import {
  APPLICATION_ALLOWED_TRANSITIONS,
  WORKER_PERMITTED_TRANSITIONS,
  EMPLOYER_PERMITTED_TRANSITIONS,
} from '../application.constants';
import { calculateHaversineDistanceKm } from '../application.service';
import {
  createApplicationSchema,
  workerApplicationsQuerySchema,
  employerApplicationsQuerySchema,
} from '@localsaathi/validation';

describe('Application Domain Unit Tests (FSM, Math, Schemas)', () => {
  describe('1. Finite State Machine (FSM) Transition Rules', () => {
    it('1.1 Allows valid worker transitions from APPLIED and SHORTLISTED to WITHDRAWN', () => {
      expect(WORKER_PERMITTED_TRANSITIONS[ApplicationStatus.APPLIED]).toContain(
        ApplicationStatus.WITHDRAWN
      );
      expect(WORKER_PERMITTED_TRANSITIONS[ApplicationStatus.SHORTLISTED]).toContain(
        ApplicationStatus.WITHDRAWN
      );
    });

    it('1.2 Forbids worker from transitioning out of terminal states (ACCEPTED, REJECTED, WITHDRAWN)', () => {
      expect(WORKER_PERMITTED_TRANSITIONS[ApplicationStatus.ACCEPTED]).toEqual([]);
      expect(WORKER_PERMITTED_TRANSITIONS[ApplicationStatus.REJECTED]).toEqual([]);
      expect(WORKER_PERMITTED_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toEqual([]);
    });

    it('1.3 Allows employer transitions: APPLIED -> SHORTLISTED, APPLIED -> REJECTED, SHORTLISTED -> ACCEPTED, SHORTLISTED -> REJECTED', () => {
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.APPLIED]).toEqual([
        ApplicationStatus.SHORTLISTED,
        ApplicationStatus.REJECTED,
      ]);
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.SHORTLISTED]).toEqual([
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.REJECTED,
      ]);
    });

    it('1.4 Forbids employer from directly ACCEPTING an APPLIED application without SHORTLISTING first', () => {
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.APPLIED]).not.toContain(
        ApplicationStatus.ACCEPTED
      );
    });

    it('1.5 Forbids employer from transitioning out of terminal states', () => {
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.ACCEPTED]).toEqual([]);
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.REJECTED]).toEqual([]);
      expect(EMPLOYER_PERMITTED_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toEqual([]);
    });

    it('1.6 Full system FSM confirms terminal states have no outgoing transitions', () => {
      expect(APPLICATION_ALLOWED_TRANSITIONS[ApplicationStatus.ACCEPTED]).toHaveLength(0);
      expect(APPLICATION_ALLOWED_TRANSITIONS[ApplicationStatus.REJECTED]).toHaveLength(0);
      expect(APPLICATION_ALLOWED_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toHaveLength(0);
    });
  });

  describe('2. Haversine Distance Calculation', () => {
    it('2.1 Calculates 0 km for identical coordinates', () => {
      const dist = calculateHaversineDistanceKm(26.85, 80.95, 26.85, 80.95);
      expect(dist).toBe(0);
    });

    it('2.2 Calculates accurate distance between Hazratganj coordinates (~300m)', () => {
      // (26.8520, 80.9500) to (26.8500, 80.9480)
      const dist = calculateHaversineDistanceKm(26.852, 80.95, 26.85, 80.948);
      expect(dist).toBeGreaterThan(0.2);
      expect(dist).toBeLessThan(0.4);
    });

    it('2.3 Calculates accurate distance between Delhi and Lucknow (~420 km)', () => {
      // Connaught Place Delhi (28.6315, 77.2167) to Hazratganj Lucknow (26.8500, 80.9480)
      const dist = calculateHaversineDistanceKm(28.6315, 77.2167, 26.85, 80.948);
      expect(dist).toBeGreaterThan(400);
      expect(dist).toBeLessThan(450);
    });
  });

  describe('3. Validation Schemas', () => {
    it('3.1 Validates createApplicationSchema with optional message', () => {
      const validEmpty = createApplicationSchema.safeParse({});
      expect(validEmpty.success).toBe(true);

      const validMsg = createApplicationSchema.safeParse({
        message: 'Qualified certified electrician with 5 years experience.',
      });
      expect(validMsg.success).toBe(true);

      const invalidLong = createApplicationSchema.safeParse({
        message: 'a'.repeat(1001),
      });
      expect(invalidLong.success).toBe(false);
    });

    it('3.2 Validates workerApplicationsQuerySchema with defaults and coercion', () => {
      const parsed = workerApplicationsQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
        expect(parsed.data.sort).toBe('applied_at_desc');
      }

      const parsedFilter = workerApplicationsQuerySchema.safeParse({
        status: 'SHORTLISTED',
        page: '2',
        limit: '15',
        sort: 'applied_at_asc',
      });
      expect(parsedFilter.success).toBe(true);
      if (parsedFilter.success) {
        expect(parsedFilter.data.status).toBe(ApplicationStatus.SHORTLISTED);
        expect(parsedFilter.data.page).toBe(2);
        expect(parsedFilter.data.limit).toBe(15);
      }
    });

    it('3.3 Validates employerApplicationsQuerySchema with sorting options', () => {
      const parsed = employerApplicationsQuerySchema.safeParse({
        sort: 'distance_asc',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.sort).toBe('distance_asc');
      }

      const invalidSort = employerApplicationsQuerySchema.safeParse({
        sort: 'unsupported_sort_injection',
      });
      expect(invalidSort.success).toBe(false);
    });
  });
});
