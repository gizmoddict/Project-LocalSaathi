import { WageType } from './job.types';
import { UserRole } from './user.types';
import { PaginationMetadata } from './api.types';

/**
 * Strict Booking Lifecycle Finite State Machine (FSM) states.
 */
export enum BookingStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED',
}

/**
 * Optional contractual overrides when creating a booking from an accepted application.
 * If omitted, contractual terms are automatically snapshotted from the job post.
 */
export interface CreateBookingInput {
  agreedWage?: number;
  wageType?: WageType;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  durationDays?: number;
  workLocationAddress?: string;
  workLocationLocality?: string;
  workLocationCity?: string;
  workLocationState?: string;
  workLocationPinCode?: string;
}

/**
 * Payload required to cancel an active booking.
 */
export interface CancelBookingInput {
  reason: string;
}

/**
 * Compact summary of a booking for feed listings.
 */
export interface BookingSummary {
  id: string;
  jobPostId: string;
  applicationId: string;
  employerProfileId: string;
  workerProfileId: string;
  status: BookingStatus;
  jobTitle: string;
  jobCategory: string;
  agreedWage: number;
  wageType: WageType;
  totalAmount: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  durationDays: number;
  workLocationLocality: string | null;
  workLocationCity: string | null;
  workerName: string;
  employerName: string;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/**
 * Comprehensive booking detail view including snapshot contract data and relations.
 */
export interface BookingDetail extends BookingSummary {
  workLocationAddress: string | null;
  workLocationState: string | null;
  workLocationPinCode: string | null;
  workLocationLatitude: number | null;
  workLocationLongitude: number | null;
  cancellationReason: string | null;
  cancelledByRole: UserRole | null;
  job: {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
  };
  worker: {
    id: string;
    displayName: string;
    experienceYears: number;
    skills: Array<{
      name: string;
      proficiency: string;
    }>;
  };
  employer: {
    id: string;
    businessName: string;
    businessType: string;
    locality: string | null;
    city: string | null;
  };
}

/**
 * Paginated list response for booking queries.
 */
export interface BookingListResponse {
  items: BookingSummary[];
  pagination: PaginationMetadata;
}

/**
 * Query filters for bookings list endpoint.
 */
export interface BookingQueryInput {
  status?: BookingStatus;
  page?: number;
  limit?: number;
  sort?: 'created_at_desc' | 'start_date_asc';
}
