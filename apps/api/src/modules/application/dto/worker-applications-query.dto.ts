import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@localsaathi/types';

export class WorkerApplicationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter applications by status',
    enum: ApplicationStatus,
  })
  status?: ApplicationStatus;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
  })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page (max 100)',
    default: 20,
  })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Sort order for application history',
    enum: ['applied_at_desc', 'applied_at_asc'],
    default: 'applied_at_desc',
  })
  sort: 'applied_at_desc' | 'applied_at_asc' = 'applied_at_desc';
}
