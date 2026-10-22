import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkerJobRecommendationQueryOutput } from '@localsaathi/validation';

export class WorkerJobRecommendationQueryDto implements WorkerJobRecommendationQueryOutput {
  @ApiPropertyOptional({
    description: 'Page number for paginated results (1-indexed)',
    default: 1,
    minimum: 1,
  })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of recommended jobs per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filter recommended jobs by industry trade category',
    example: 'Plumbing',
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Override search radius in km (bounded by worker preferred radius)',
    example: 15,
  })
  maxRadiusKm?: number;
}
