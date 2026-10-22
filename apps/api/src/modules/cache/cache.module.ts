// ==============================================================================
// LocalSaathi — Cache Module Registration (Phase 19)
// ==============================================================================

import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheMetrics } from './cache.metrics';

@Global()
@Module({
  providers: [CacheService, CacheMetrics],
  exports: [CacheService, CacheMetrics],
})
export class CacheModule {}
