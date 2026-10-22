import { ApiPropertyOptional } from '@nestjs/swagger';
import { NearbyJobsQueryOutput } from '@localsaathi/validation';

export class NearbyJobsQueryDto implements NearbyJobsQueryOutput {
  @ApiPropertyOptional({
    description: 'Custom search radius in kilometers (capped at worker preferred radius)',
    example: 10,
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
