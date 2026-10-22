import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@localsaathi/types';

export class BookingQueryDto {
  @ApiPropertyOptional({
    description: 'Filter bookings by lifecycle status',
    enum: BookingStatus,
  })
  status?: BookingStatus;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
  })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
  })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['created_at_desc', 'start_date_asc'],
    default: 'created_at_desc',
  })
  sort: 'created_at_desc' | 'start_date_asc' = 'created_at_desc';
}
