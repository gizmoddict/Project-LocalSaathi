import { BookingStatus } from '@localsaathi/types';
import {
  BOOKING_FSM_TRANSITIONS,
  isValidBookingTransition,
  isTerminalBookingState,
  BOOKING_ERROR_CODES,
} from '../booking.constants';
import {
  createBookingSchema,
  cancelBookingSchema,
  bookingQuerySchema,
} from '@localsaathi/validation';

describe('Booking Domain Unit Tests (FSM, Validation Schemas, Constraints)', () => {
  describe('1. Booking Finite State Machine (FSM) Transitions', () => {
    it('1.1 Allows transition: PENDING_CONFIRMATION -> CONFIRMED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.PENDING_CONFIRMATION,
          BookingStatus.CONFIRMED
        )
      ).toBe(true);
    });

    it('1.2 Allows transition: PENDING_CONFIRMATION -> CANCELLED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.PENDING_CONFIRMATION,
          BookingStatus.CANCELLED
        )
      ).toBe(true);
    });

    it('1.3 Forbids transition: PENDING_CONFIRMATION -> IN_PROGRESS or COMPLETED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.PENDING_CONFIRMATION,
          BookingStatus.IN_PROGRESS
        )
      ).toBe(false);
      expect(
        isValidBookingTransition(
          BookingStatus.PENDING_CONFIRMATION,
          BookingStatus.COMPLETED
        )
      ).toBe(false);
    });

    it('1.4 Allows transition: CONFIRMED -> IN_PROGRESS', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS
        )
      ).toBe(true);
    });

    it('1.5 Allows transition: CONFIRMED -> CANCELLED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.CONFIRMED,
          BookingStatus.CANCELLED
        )
      ).toBe(true);
    });

    it('1.6 Forbids transition: CONFIRMED -> COMPLETED directly', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.CONFIRMED,
          BookingStatus.COMPLETED
        )
      ).toBe(false);
    });

    it('1.7 Allows transition: IN_PROGRESS -> COMPLETED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.IN_PROGRESS,
          BookingStatus.COMPLETED
        )
      ).toBe(true);
    });

    it('1.8 Allows transition: IN_PROGRESS -> CANCELLED', () => {
      expect(
        isValidBookingTransition(
          BookingStatus.IN_PROGRESS,
          BookingStatus.CANCELLED
        )
      ).toBe(true);
    });

    it('1.9 Identifies COMPLETED, CANCELLED, DISPUTED as terminal states', () => {
      expect(isTerminalBookingState(BookingStatus.COMPLETED)).toBe(true);
      expect(isTerminalBookingState(BookingStatus.CANCELLED)).toBe(true);
      expect(isTerminalBookingState(BookingStatus.DISPUTED)).toBe(true);
      expect(isTerminalBookingState(BookingStatus.PENDING_CONFIRMATION)).toBe(false);
      expect(isTerminalBookingState(BookingStatus.CONFIRMED)).toBe(false);
      expect(isTerminalBookingState(BookingStatus.IN_PROGRESS)).toBe(false);
    });

    it('1.10 Ensures terminal states have zero outgoing transitions in FSM', () => {
      expect(BOOKING_FSM_TRANSITIONS[BookingStatus.COMPLETED]).toHaveLength(0);
      expect(BOOKING_FSM_TRANSITIONS[BookingStatus.CANCELLED]).toHaveLength(0);
      expect(BOOKING_FSM_TRANSITIONS[BookingStatus.DISPUTED]).toHaveLength(0);
    });
  });

  describe('2. Validation Schemas', () => {
    it('2.1 Accepts valid empty createBookingSchema (uses job defaults)', () => {
      const res = createBookingSchema.safeParse({});
      expect(res.success).toBe(true);
    });

    it('2.2 Accepts complete contractual overrides in createBookingSchema', () => {
      const res = createBookingSchema.safeParse({
        agreedWage: 950,
        wageType: 'DAILY',
        startDate: '2026-10-20',
        endDate: '2026-10-22',
        startTime: '09:00',
        endTime: '17:30',
        durationDays: 3,
        workLocationAddress: 'Sector 14, Commercial Hub',
        workLocationLocality: 'Indira Nagar',
        workLocationCity: 'Lucknow',
        workLocationState: 'Uttar Pradesh',
        workLocationPinCode: '226016',
      });
      expect(res.success).toBe(true);
    });

    it('2.3 Rejects negative or zero agreedWage', () => {
      const zeroWage = createBookingSchema.safeParse({ agreedWage: 0 });
      expect(zeroWage.success).toBe(false);

      const negWage = createBookingSchema.safeParse({ agreedWage: -100 });
      expect(negWage.success).toBe(false);
    });

    it('2.4 Rejects invalid date or time format', () => {
      const badDate = createBookingSchema.safeParse({ startDate: '20-10-2026' });
      expect(badDate.success).toBe(false);

      const badTime = createBookingSchema.safeParse({ startTime: '25:00' });
      expect(badTime.success).toBe(false);
    });

    it('2.5 Validates cancelBookingSchema requiring 3 to 500 chars reason', () => {
      const valid = cancelBookingSchema.safeParse({
        reason: 'Worker had a medical emergency.',
      });
      expect(valid.success).toBe(true);

      const tooShort = cancelBookingSchema.safeParse({ reason: 'No' });
      expect(tooShort.success).toBe(false);

      const empty = cancelBookingSchema.safeParse({ reason: '   ' });
      expect(empty.success).toBe(false);
    });

    it('2.6 Validates bookingQuerySchema with default pagination', () => {
      const parsed = bookingQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
        expect(parsed.data.sort).toBe('created_at_desc');
      }
    });
  });

  describe('3. Error Codes Constants', () => {
    it('3.1 Exposes required domain error codes', () => {
      expect(BOOKING_ERROR_CODES.APPLICATION_NOT_ACCEPTED).toBe('APPLICATION_NOT_ACCEPTED');
      expect(BOOKING_ERROR_CODES.BOOKING_ALREADY_EXISTS).toBe('BOOKING_ALREADY_EXISTS');
      expect(BOOKING_ERROR_CODES.WORKER_SCHEDULE_CONFLICT).toBe('WORKER_SCHEDULE_CONFLICT');
      expect(BOOKING_ERROR_CODES.INVALID_TRANSITION).toBe('INVALID_TRANSITION');
      expect(BOOKING_ERROR_CODES.TERMINAL_STATE).toBe('TERMINAL_STATE');
      expect(BOOKING_ERROR_CODES.NOT_FOUND).toBe('BOOKING_NOT_FOUND');
    });
  });
});
