import { ApiPropertyOptional } from '@nestjs/swagger';
import { WageType } from '@localsaathi/types';

export class CreateBookingDto {
  @ApiPropertyOptional({
    description: 'Agreed wage (if negotiated differently from job post)',
    example: 850,
  })
  agreedWage?: number;

  @ApiPropertyOptional({
    description: 'Agreed wage structure type',
    enum: WageType,
    example: WageType.DAILY,
  })
  wageType?: WageType;

  @ApiPropertyOptional({
    description: 'Engagement start date in YYYY-MM-DD format',
    example: '2026-10-15',
  })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Engagement end date in YYYY-MM-DD format',
    example: '2026-10-17',
  })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Daily start time in HH:MM format',
    example: '09:00',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Daily end time in HH:MM format',
    example: '18:00',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Duration in days',
    example: 3,
  })
  durationDays?: number;

  @ApiPropertyOptional({
    description: 'Overridden work address',
    example: 'Shop 12, Main Market',
  })
  workLocationAddress?: string;

  @ApiPropertyOptional({
    description: 'Overridden work locality',
    example: 'Koramangala',
  })
  workLocationLocality?: string;

  @ApiPropertyOptional({
    description: 'Overridden work city',
    example: 'Bengaluru',
  })
  workLocationCity?: string;

  @ApiPropertyOptional({
    description: 'Overridden work state',
    example: 'Karnataka',
  })
  workLocationState?: string;

  @ApiPropertyOptional({
    description: 'Overridden work PIN code',
    example: '560034',
  })
  workLocationPinCode?: string;
}
