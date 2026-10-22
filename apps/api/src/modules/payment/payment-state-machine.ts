// ==============================================================================
// LocalSaathi — Payment State Machine (Phase 14)
// ==============================================================================

import { PaymentStatus } from '@prisma/client';

export class PaymentStateMachine {
  private static readonly VALID_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
    [PaymentStatus.INITIATED]: [
      PaymentStatus.AUTHORIZED,
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED,
    ],
    [PaymentStatus.AUTHORIZED]: [
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED,
    ],
    [PaymentStatus.CAPTURED]: [
      PaymentStatus.REFUNDED,
      PaymentStatus.DISPUTED,
    ],
    [PaymentStatus.DISPUTED]: [
      PaymentStatus.REFUNDED,
      PaymentStatus.CAPTURED,
    ],
    [PaymentStatus.FAILED]: [],
    [PaymentStatus.REFUNDED]: [],
  };

  /**
   * Checks whether a transition from current status to next status is legal.
   */
  public static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    if (from === to) return true; // idempotent self-transition
    const allowed = this.VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts that a transition from current status to next status is legal.
   * Throws an error if illegal.
   */
  public static assertCanTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Illegal payment transition from status '${from}' to '${to}'. Allowed transitions: [${this.VALID_TRANSITIONS[from].join(', ')}]`,
      );
    }
  }

  /**
   * Determines if a payment status is terminal.
   */
  public static isTerminal(status: PaymentStatus): boolean {
    return this.VALID_TRANSITIONS[status].length === 0;
  }
}
