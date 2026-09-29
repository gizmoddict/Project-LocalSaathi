/**
 * Strict Job Lifecycle Finite State Machine (FSM) states.
 */
export enum JobStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  FILLED = 'FILLED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Wage payment structure.
 */
export enum WageType {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  FIXED = 'FIXED',
  PIECE_RATE = 'PIECE_RATE',
}

/**
 * Urgency flag for matching and notification prioritization.
 */
export enum JobUrgency {
  IMMEDIATE = 'IMMEDIATE', // within 24 hours
  STANDARD = 'STANDARD',   // next 2-5 days
  FLEXIBLE = 'FLEXIBLE',   // whenever available
}
