import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkerJobDiscoveryQueryOutput } from '@localsaathi/validation';
import { WageType } from '@localsaathi/types';

export class WorkerJobQueryDto implements WorkerJobDiscoveryQueryOutput {
  @ApiPropertyOptional({
    description: 'Free-text search keyword matching job title or description',
    example: 'electrician',
  })
  query?: string;

  @ApiPropertyOptional({
    description: 'Custom search radius in kilometers (capped at worker preferred radius)',
    example: 15,
  })
  radiusKm?: number;

  @ApiPropertyOptional({
    description: 'Explicit center latitude for spatial map search',
    example: 26.85,
    minimum: -90,
    maximum: 90,
  })
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Explicit center longitude for spatial map search',
    example: 80.948,
    minimum: -180,
    maximum: 180,
  })
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Filter by specific required Skill UUID',
    example: '11111111-2222-3333-4444-555555555555',
  })
  skillId?: string;

  @ApiPropertyOptional({
    description: 'Filter by job category (e.g. Electrical, Plumbing, Construction)',
    example: 'Electrical',
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by wage payment structure',
    enum: ['HOURLY', 'DAILY', 'FIXED', 'PIECE_RATE'],
  })
  wageType?: WageType;

  @ApiPropertyOptional({
    description: 'Minimum offered wage amount in INR',
    example: 500,
  })
  minWage?: number;

  @ApiPropertyOptional({
    description: 'Maximum offered wage amount in INR',
    example: 2000,
  })
  maxWage?: number;

  @ApiPropertyOptional({
    description: 'Job execution start date (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  date?: string;

  @ApiPropertyOptional({
    description: 'Sorting criteria for discovered jobs',
    enum: ['score_desc', 'distance_asc', 'wage_desc', 'created_desc'],
    default: 'score_desc',
  })
  sort: 'score_desc' | 'distance_asc' | 'wage_desc' | 'created_desc' = 'score_desc';

  @ApiPropertyOptional({
    description: 'Pagination page number (1-based)',
    default: 1,
  })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of job items per page (max 50)',
    default: 20,
  })
  limit: number = 20;
}
