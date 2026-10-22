import { ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityStatus } from '@localsaathi/types';

export class UpdateWorkerAvailabilityDto {
  @ApiPropertyOptional({
    description: 'Updated work window start time (24-hour HH:mm)',
    example: '09:00',
  })
  startTime?: string | null;

  @ApiPropertyOptional({
    description: 'Updated work window end time (24-hour HH:mm)',
    example: '18:00',
  })
  endTime?: string | null;

  @ApiPropertyOptional({
    description: 'Updated availability status',
    enum: AvailabilityStatus,
  })
  status?: AvailabilityStatus;
}
