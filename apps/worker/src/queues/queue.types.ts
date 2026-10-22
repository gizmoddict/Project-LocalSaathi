// ==============================================================================
// LocalSaathi — Queue Definitions & Handler Interfaces (@localsaathi/worker)
// ==============================================================================

export * from '@localsaathi/types';

import { JobContract, QueueName } from '@localsaathi/types';

export interface IJobHandler<T = unknown> {
  readonly queueName: QueueName;
  handle(job: JobContract<T>): Promise<void>;
}
