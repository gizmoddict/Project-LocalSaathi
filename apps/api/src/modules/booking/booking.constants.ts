import { BookingStatus } from '@localsaathi/types';

/**
 * Strict Finite State Machine (FSM) permitted transitions for bookings.
 */
export const BOOKING_FSM_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [], // Terminal state
  [BookingStatus.CANCELLED]: [], // Terminal state
  [BookingStatus.DISPUTED]: [], // Terminal state
};

/**
 * Validates whether a state transition is legal in the Booking FSM.
 */
export function isValidBookingTransition(from: BookingStatus, to: BookingStatus): boolean {
  const allowed = BOOKING_FSM_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

/**
 * Checks if a booking status is a terminal state.
 */
export function isTerminalBookingState(status: BookingStatus): boolean {
  return (
    status === BookingStatus.COMPLETED ||
    status === BookingStatus.CANCELLED ||
    status === BookingStatus.DISPUTED
  );
}

export const BOOKING_ERROR_CODES = {
  APPLICATION_NOT_ACCEPTED: 'APPLICATION_NOT_ACCEPTED',
  BOOKING_ALREADY_EXISTS: 'BOOKING_ALREADY_EXISTS',
  WORKER_SCHEDULE_CONFLICT: 'WORKER_SCHEDULE_CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  TERMINAL_STATE: 'TERMINAL_STATE',
  UNAUTHORIZED_ACTION: 'UNAUTHORIZED_ACTION',
  NOT_FOUND: 'BOOKING_NOT_FOUND',
};
