// ==============================================================================
// LocalSaathi — Bounded Timeout Utility (Phase 22)
// Guarantees Dependencies Never Hang Requests Indefinitely (Sections 6, 7)
// ==============================================================================

import { TimeoutOptions, ReliabilityErrorCode } from '@localsaathi/types';
import { ReliabilityException } from './reliability.errors';
import { MetricsService } from '../observability/metrics.service';

export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions,
  metricsService?: MetricsService,
): Promise<T> {
  const { timeoutMs, operationName, dependency, onTimeout } = options;

  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (metricsService) {
        try {
          metricsService.incrementCounter('timeout_total', {
            dependency,
            operation: operationName,
          });
        } catch {
          // Bounded metric protection
        }
      }

      if (onTimeout) {
        try {
          onTimeout();
        } catch {
          // Non-blocking hook
        }
      }

      reject(
        new ReliabilityException({
          errorCode: ReliabilityErrorCode.TIMEOUT,
          operation: operationName,
          dependency,
          message: `Operation '${operationName}' timed out after ${timeoutMs}ms on dependency '${dependency}'`,
        }),
      );
    }, timeoutMs);

    // Prevent timer from keeping the process alive
    if (timer.unref) {
      timer.unref();
    }
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
