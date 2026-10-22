import { Module } from '@nestjs/common';
import { WorkerController } from './worker.controller';
import { WorkerService } from './worker.service';
import { WorkerCompletionService } from './services/worker-completion.service';
import { ProfileImageStorageService } from './services/profile-image-storage.service';

@Module({
  controllers: [WorkerController],
  providers: [WorkerService, WorkerCompletionService, ProfileImageStorageService],
  exports: [WorkerService, WorkerCompletionService, ProfileImageStorageService],
})
export class WorkerModule {}
