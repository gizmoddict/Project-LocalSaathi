import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@localsaathi/types';

export class EmployerApplicationsQueryDto {
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
    description: 'Sort criteria for applicant evaluation',
    enum: ['match_score_desc', 'applied_at_desc', 'applied_at_asc', 'distance_asc'],
    default: 'match_score_desc',
  })
  sort: 'match_score_desc' | 'applied_at_desc' | 'applied_at_asc' | 'distance_asc' = 'match_score_desc';
}
