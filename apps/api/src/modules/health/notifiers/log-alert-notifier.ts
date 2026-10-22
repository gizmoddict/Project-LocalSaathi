// ==============================================================================
// LocalSaathi — Log-Based Local Alert Notifier (Phase 21 Hardening)
// Safe Local Implementation of AlertNotifier Protocol
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ActiveAlert, AlertNotifier } from '@localsaathi/types';

@Injectable()
export class LogAlertNotifier implements AlertNotifier {
  private readonly logger = new Logger('AlertNotifier');

  async notify(alert: ActiveAlert): Promise<void> {
    const formatted = `[LOCAL_ALERT_DISPATCH] [${alert.severity}] ${alert.ruleName} (ID=${alert.alertId}): Current=${alert.currentValue}, Threshold=${alert.threshold} — ${alert.message}`;
    if (alert.severity === 'CRITICAL') {
      this.logger.error(formatted);
    } else {
      this.logger.warn(formatted);
    }
  }
}
