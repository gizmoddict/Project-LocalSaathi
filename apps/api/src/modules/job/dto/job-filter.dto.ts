import { JobFilterQuery } from '@localsaathi/validation';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class JobFilterDto implements JobFilterQuery {
  @ApiPropertyOptional({
    description: 'Filter by job lifecycle status',
    enum: ['DRAFT', 'PUBLISHED', 'PAUSED', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  })
  status?: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'FILLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10 })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['createdAt', 'startDate', 'wageAmount'],
    default: 'createdAt',
  })
  sortBy?: 'createdAt' | 'startDate' | 'wageAmount' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
