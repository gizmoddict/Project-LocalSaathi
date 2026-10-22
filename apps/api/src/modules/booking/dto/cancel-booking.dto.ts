import { ApiProperty } from '@nestjs/swagger';

export class CancelBookingDto {
  @ApiProperty({
    description: 'Mandatory reason for cancelling the booking',
    example: 'Unexpected emergency; cannot attend work on scheduled date.',
    minLength: 3,
    maxLength: 500,
  })
  reason!: string;
}
