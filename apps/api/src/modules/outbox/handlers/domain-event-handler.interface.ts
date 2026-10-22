import { DomainEventEnvelope } from '@localsaathi/types';

export interface DomainEventHandler<T = Record<string, unknown>> {
  /** Unique name of this handler for EventProcessing idempotency tracking */
  readonly handlerName: string;

  /** Predicate determining whether this handler processes the given event type */
  canHandle(eventType: string): boolean;

  /**
   * Executes the handler logic.
   * Must be idempotent and throw an Error if a retryable failure occurs.
   */
  handle(event: DomainEventEnvelope<T>): Promise<void>;
}
