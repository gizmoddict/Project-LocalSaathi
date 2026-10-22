import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({
    description: '10-digit Indian mobile number (e.g. 9876543210 or +919876543210)',
    example: '9876543210',
  })
  phone!: string;

  @ApiProperty({
    description: 'Requested account role for new self-registrations (WORKER or EMPLOYER only)',
    enum: ['WORKER', 'EMPLOYER'],
    default: 'WORKER',
    required: false,
  })
  role?: 'WORKER' | 'EMPLOYER';
}
