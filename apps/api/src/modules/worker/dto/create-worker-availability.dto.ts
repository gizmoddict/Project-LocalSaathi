import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityStatus } from '@localsaathi/types';

export class CreateWorkerAvailabilityDto {
  @ApiProperty({
    description: 'Scheduled date for work availability (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  date!: string;

  @ApiPropertyOptional({
    description: 'Work window start time (24-hour HH:mm)',
    example: '08:00',
  })
  startTime?: string | null;

  @ApiPropertyOptional({
    description: 'Work window end time (24-hour HH:mm)',
    example: '17:00',
  })
  endTime?: string | null;

  @ApiPropertyOptional({
    description: 'Availability status for the slot',
    enum: AvailabilityStatus,
    default: AvailabilityStatus.AVAILABLE,
  })
  status?: AvailabilityStatus;
}
